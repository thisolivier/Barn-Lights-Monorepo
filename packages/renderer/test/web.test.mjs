import test, { before, after } from 'node:test';
import assert from 'assert/strict';
import { spawn } from 'child_process';
import { once } from 'events';
import { fileURLToPath } from 'url';
import { mkdir, writeFile } from 'fs/promises';
import puppeteer from 'puppeteer';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Browser pooling - shared browser instance across tests
let browser;

before(async () => {
  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
});

after(async () => {
  if (browser) await browser.close().catch(() => {});
});

async function waitForServer(url, retries = 100){
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) {
        clearTimeout(timeoutId);
        return;
      }
    } catch (err) {
      // Log retry attempts so caller knows what's happening
      console.log(`waitForServer: attempt ${i + 1}/${retries} failed - ${err.name === 'AbortError' ? 'timeout' : err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server not responding');
}

async function startServerOnDynamicPort() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['bin/engine.mjs', '--config-dir', '../../config', '--port', '0'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let resolved = false;

    proc.stdout.on('data', chunk => {
      stdout += chunk.toString();
      // Look for SERVER_PORT=XXXXX in stdout
      const match = stdout.match(/SERVER_PORT=(\d+)/);
      if (match && !resolved) {
        resolved = true;
        resolve({ proc, port: parseInt(match[1], 10) });
      }
    });

    proc.on('error', (err) => {
      if (!resolved) reject(err);
    });
    proc.on('exit', (code) => {
      if (!resolved && code !== null && code !== 0) {
        reject(new Error(`Process exited with code ${code}: ${stdout}`));
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!resolved) reject(new Error('Timeout waiting for server port'));
    }, 10000);
  });
}

// Debug helper: capture diagnostic info on test failure
async function captureDebugInfo(page, testName) {
  try {
    await mkdir('test-failures', { recursive: true });
    const timestamp = Date.now();

    // Screenshot
    const screenshotPath = `test-failures/${testName}-${timestamp}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.error(`Screenshot saved: ${screenshotPath}`);

    // Console logs
    const logs = await page.evaluate(() => {
      return window.__testLogs || [];
    });
    if (logs.length > 0) {
      console.error('Page console logs:', logs);
    }

    // Page HTML snapshot
    const html = await page.content();
    const htmlPath = `test-failures/${testName}-${timestamp}.html`;
    await writeFile(htmlPath, html);
    console.error(`HTML snapshot saved: ${htmlPath}`);
  } catch (debugErr) {
    console.error('Failed to capture debug info:', debugErr.message);
  }
}

test('web view loads with no console errors', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  let page;
  try {
    await waitForServer(`http://127.0.0.1:${port}`);

    page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(new Error(msg.text())); });

    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle0' });
    assert.equal(errors.length, 0, `Expected no errors but got: ${errors.map(e => e.message).join(', ')}`);
  } catch (err) {
    if (page) await captureDebugInfo(page, 'web-view-no-errors');
    throw err;
  } finally {
    if (page) await page.close().catch(() => {});
    proc.kill();
    if (proc.exitCode === null) {
      const exitTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Process exit timeout')), 5000)
      );
      await Promise.race([once(proc, 'exit'), exitTimeout]).catch(() => {});
    }
  }
});
