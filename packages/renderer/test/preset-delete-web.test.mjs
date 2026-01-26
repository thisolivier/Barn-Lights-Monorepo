import test, { before, after } from 'node:test';
import assert from 'assert/strict';
import { spawn } from 'child_process';
import { once } from 'events';
import { fileURLToPath } from 'url';
import { mkdir, writeFile, unlink } from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import { savePreset, listPresets } from '../src/config-store.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const presetsDir = path.resolve(ROOT, 'config/presets');

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

// Generate unique test name for isolation
function uniqueName(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

    setTimeout(() => {
      if (!resolved) reject(new Error('Timeout waiting for server port'));
    }, 10000);
  });
}

// Debug helper
async function captureDebugInfo(page, testName, extraInfo = {}) {
  try {
    await mkdir('test-failures', { recursive: true });
    const timestamp = Date.now();
    const screenshotPath = `test-failures/${testName}-${timestamp}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.error(`Screenshot saved: ${screenshotPath}`);
    if (Object.keys(extraInfo).length > 0) {
      console.error('Extra debug info:', extraInfo);
    }
    const html = await page.content();
    const htmlPath = `test-failures/${testName}-${timestamp}.html`;
    await writeFile(htmlPath, html);
    console.error(`HTML snapshot saved: ${htmlPath}`);
  } catch (debugErr) {
    console.error('Failed to capture debug info:', debugErr.message);
  }
}

const testParams = {
  effect: 'solid',
  fpsCap: 30,
  renderMode: 'duplicate',
  effects: { solid: { r: 1, g: 0, b: 0 } },
  post: { brightness: 1 }
};

test('delete button removes preset from UI and backend', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  let page;
  const testPresetName = uniqueName('delete-ui');
  const presetPath = path.join(presetsDir, `${testPresetName}.json`);
  const imagePath = path.join(presetsDir, `${testPresetName}.png`);

  try {
    // Create test preset with image
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12P4//8/AwAI/AL+XJ/kAAAAAElFTkSuQmCC',
      'base64'
    );
    await savePreset(testPresetName, testParams, png);

    await waitForServer(`http://127.0.0.1:${port}`);
    page = await browser.newPage();

    // Set up dialog handler to auto-confirm
    page.on('dialog', async dialog => {
      assert.equal(dialog.type(), 'confirm');
      assert(dialog.message().includes(testPresetName));
      await dialog.accept();
    });

    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle0' });

    // Wait for preset to appear
    await page.waitForSelector('.presetItem', { timeout: WAIT_TIMEOUT });

    // Count presets before delete
    const countBefore = await page.evaluate(() => {
      return document.querySelectorAll('.presetItem').length;
    });

    // Find our test preset and click its delete button
    const deleted = await page.evaluate(async (name) => {
      const items = Array.from(document.querySelectorAll('.presetItem'));
      for (const item of items) {
        const nameEl = item.querySelector('.presetName');
        if (nameEl && nameEl.textContent === name) {
          const btn = item.querySelector('.deleteBtn');
          if (btn) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    }, testPresetName);

    assert(deleted, 'Could not find test preset to delete');

    // Wait for preset to disappear from UI
    await page.waitForFunction(
      (name) => {
        const items = Array.from(document.querySelectorAll('.presetItem .presetName'));
        return !items.some(el => el.textContent === name);
      },
      { timeout: WAIT_TIMEOUT },
      testPresetName
    );

    // Verify preset count decreased
    const countAfter = await page.evaluate(() => {
      return document.querySelectorAll('.presetItem').length;
    });
    assert.equal(countAfter, countBefore - 1);

    // Verify preset deleted from backend
    const presets = await listPresets();
    assert(!presets.includes(testPresetName));

  } catch (err) {
    if (page) await captureDebugInfo(page, 'delete-preset-ui', { testPresetName });
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
    // Cleanup any leftover files
    await unlink(presetPath).catch(() => {});
    await unlink(imagePath).catch(() => {});
  }
});

test('clicking delete button does not load preset when cancelled', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  let page;
  const testPresetName = uniqueName('nodelete');
  const presetPath = path.join(presetsDir, `${testPresetName}.json`);
  const imagePath = path.join(presetsDir, `${testPresetName}.png`);

  try {
    // Create test preset
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12P4//8/AwAI/AL+XJ/kAAAAAElFTkSuQmCC',
      'base64'
    );
    await savePreset(testPresetName, testParams, png);

    await waitForServer(`http://127.0.0.1:${port}`);
    page = await browser.newPage();

    // Set up dialog handler to dismiss (cancel)
    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });

    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.presetItem', { timeout: WAIT_TIMEOUT });

    // Count presets before
    const countBefore = await page.evaluate(() => {
      return document.querySelectorAll('.presetItem').length;
    });

    // Click delete button (will be cancelled)
    await page.evaluate(async (name) => {
      const items = Array.from(document.querySelectorAll('.presetItem'));
      for (const item of items) {
        const nameEl = item.querySelector('.presetName');
        if (nameEl && nameEl.textContent === name) {
          const btn = item.querySelector('.deleteBtn');
          if (btn) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    }, testPresetName);

    // Wait a moment
    await new Promise(r => setTimeout(r, 500));

    // Verify preset count unchanged
    const countAfter = await page.evaluate(() => {
      return document.querySelectorAll('.presetItem').length;
    });
    assert.equal(countAfter, countBefore);

    // Verify preset still exists in backend
    const presets = await listPresets();
    assert(presets.includes(testPresetName));

  } catch (err) {
    if (page) await captureDebugInfo(page, 'cancel-delete', { testPresetName });
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
    // Cleanup
    await unlink(presetPath).catch(() => {});
    await unlink(imagePath).catch(() => {});
  }
});
