import test, { before, after } from 'node:test';
import assert from 'assert/strict';
import { spawn } from 'child_process';
import { once } from 'events';
import { fileURLToPath } from 'url';
import { mkdir, writeFile } from 'fs/promises';
import puppeteer from 'puppeteer';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Explicit timeout for waitForFunction calls (5 seconds)
const WAIT_TIMEOUT = 5000;

// Browser pooling - shared browser instance across tests
let browser;

before(async () => {
  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
});

after(async () => {
  if (browser) await browser.close().catch(() => {});
});

async function waitForServer(url, retries = 100){
  for (let i=0;i<retries;i++){
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try{
      const res = await fetch(url, { signal: controller.signal });
      if(res.ok) {
        clearTimeout(timeoutId);
        return;
      }
    } catch (err) {
      // Log retry attempts so caller knows what's happening
      console.log(`waitForServer: attempt ${i + 1}/${retries} failed - ${err.name === 'AbortError' ? 'timeout' : err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
    await new Promise(r => setTimeout(r,100));
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
async function captureDebugInfo(page, testName, extraInfo = {}) {
  try {
    await mkdir('test-failures', { recursive: true });
    const timestamp = Date.now();

    // Screenshot
    const screenshotPath = `test-failures/${testName}-${timestamp}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.error(`Screenshot saved: ${screenshotPath}`);

    // Canvas pixel data
    const canvasDebug = await page.evaluate(() => {
      const leftCanvas = document.getElementById('left');
      const rightCanvas = document.getElementById('right');
      const result = {};

      if (leftCanvas) {
        const ctx = leftCanvas.getContext('2d');
        const pixel = ctx.getImageData(0, 0, 1, 1).data;
        result.leftPixel = { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
        result.leftSize = { width: leftCanvas.width, height: leftCanvas.height };
      }

      if (rightCanvas) {
        const ctx = rightCanvas.getContext('2d');
        const pixel = ctx.getImageData(0, 0, 1, 1).data;
        result.rightPixel = { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
      }

      return result;
    });
    console.error('Canvas debug info:', canvasDebug);

    // Extra info passed by test
    if (Object.keys(extraInfo).length > 0) {
      console.error('Extra debug info:', extraInfo);
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

test('loading preset updates preview gradient', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  let page;
  let beforeBlue;
  try {
    await waitForServer(`http://127.0.0.1:${port}`);
    page = await browser.newPage();

    // Enable request/response logging for debugging WebSocket issues
    page.on('requestfailed', request => {
      console.log(`Request failed: ${request.url()} - ${request.failure()?.errorText}`);
    });

    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle0' });

    // Wait for initial canvas render with explicit timeout
    await page.waitForFunction(() => {
      const ctx = document.getElementById('left')?.getContext('2d');
      if (!ctx) return false;
      return ctx.getImageData(0,0,1,1).data[2] > 10;
    }, { timeout: WAIT_TIMEOUT });

    beforeBlue = await page.evaluate(() => {
      const ctx = document.getElementById('left').getContext('2d');
      return ctx.getImageData(0,0,1,1).data[2];
    });

    // Load preset via fetch API
    const presetResponse = await page.evaluate(async () => {
      const res = await fetch('/preset/load/twoSolidColours');
      return { ok: res.ok, status: res.status };
    });

    if (!presetResponse.ok) {
      throw new Error(`Preset load failed with status ${presetResponse.status}`);
    }

    // Wait for canvas to update after preset load with explicit timeout
    await page.waitForFunction(() => {
      const ctx = document.getElementById('left')?.getContext('2d');
      if (!ctx) return false;
      return ctx.getImageData(0,0,1,1).data[2] < 10;
    }, { timeout: WAIT_TIMEOUT });

    const afterBlue = await page.evaluate(() => {
      const ctx = document.getElementById('left').getContext('2d');
      return ctx.getImageData(0,0,1,1).data[2];
    });

    assert.ok(beforeBlue > 10, `Expected beforeBlue > 10 but got ${beforeBlue}`);
    assert.ok(afterBlue < 10, `Expected afterBlue < 10 but got ${afterBlue}`);
  } catch (err) {
    if (page) await captureDebugInfo(page, 'gradient-preset-web', { beforeBlue });
    throw err;
  } finally {
    if (page) await page.close().catch(()=>{});
    proc.kill();
    if (proc.exitCode === null) {
      const exitTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Process exit timeout')), 5000)
      );
      await Promise.race([once(proc, 'exit'), exitTimeout]).catch(()=>{});
    }
  }
});
