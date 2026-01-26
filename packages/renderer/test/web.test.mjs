import test from 'node:test';
import assert from 'assert/strict';
import { spawn } from 'child_process';
import { once } from 'events';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

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

test('web view loads with no console errors', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  let browser;
  try {
    await waitForServer(`http://127.0.0.1:${port}`);

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(new Error(msg.text())); });

    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle0' });
    assert.equal(errors.length, 0);
  } finally {
    if (browser) await browser.close().catch(() => {});
    proc.kill();
    if (proc.exitCode === null) {
      const exitTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Process exit timeout')), 5000)
      );
      await Promise.race([once(proc, 'exit'), exitTimeout]).catch(() => {});
    }
  }
});
