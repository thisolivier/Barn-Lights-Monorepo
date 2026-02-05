import test, { before, after } from 'node:test';
import assert from 'assert/strict';
import { spawn } from 'child_process';
import { once } from 'events';
import { fileURLToPath } from 'url';
import { mkdir, writeFile } from 'fs/promises';
import puppeteer from 'puppeteer';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WAIT_TIMEOUT = 10000;

let browser;

before(async () => {
  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
});

after(async () => {
  if (browser) await browser.close().catch(() => {});
});

async function waitForServer(url, retries = 100) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) { clearTimeout(timeoutId); return; }
    } catch {
      // retry
    } finally {
      clearTimeout(timeoutId);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
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

    proc.on('error', (err) => { if (!resolved) reject(err); });
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

async function captureDebugInfo(page, testName, extraInfo = {}) {
  try {
    await mkdir('test-failures', { recursive: true });
    const timestamp = Date.now();

    const screenshotPath = `test-failures/${testName}-${timestamp}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.error(`Screenshot saved: ${screenshotPath}`);

    const canvasDebug = await page.evaluate(() => {
      const leftCanvas = document.getElementById('left');
      if (!leftCanvas) return { error: 'no left canvas' };
      const ctx = leftCanvas.getContext('2d');
      // Sample several pixels across the canvas
      const pixels = [];
      for (let sampleX = 0; sampleX < leftCanvas.width; sampleX += Math.floor(leftCanvas.width / 10)) {
        const pixel = ctx.getImageData(sampleX, Math.floor(leftCanvas.height / 2), 1, 1).data;
        pixels.push({ x: sampleX, r: pixel[0], g: pixel[1], b: pixel[2] });
      }
      return { size: { width: leftCanvas.width, height: leftCanvas.height }, pixels };
    });
    console.error('Canvas debug info:', JSON.stringify(canvasDebug));

    if (Object.keys(extraInfo).length > 0) {
      console.error('Extra debug info:', extraInfo);
    }

    const html = await page.content();
    const htmlPath = `test-failures/${testName}-${timestamp}.html`;
    await writeFile(htmlPath, html);
  } catch (debugErr) {
    console.error('Failed to capture debug info:', debugErr.message);
  }
}

test('GIF effect renders non-purple pixels in browser preview', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  let page;
  try {
    await waitForServer(`http://127.0.0.1:${port}`);

    // Verify GIF files are available
    const gifsResponse = await fetch(`http://127.0.0.1:${port}/gifs`);
    const gifFiles = await gifsResponse.json();
    assert.ok(gifFiles.length > 0, 'Server should have at least one GIF file');
    const gifPath = gifFiles.find(name => name.includes('fire')) || gifFiles[0];

    page = await browser.newPage();
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('Page console error:', msg.text());
    });

    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle0' });

    // Wait for initial canvas render
    await page.waitForFunction(() => {
      const ctx = document.getElementById('left')?.getContext('2d');
      return !!ctx;
    }, { timeout: WAIT_TIMEOUT });

    // Switch to GIF effect and set the gifPath via WebSocket
    await page.evaluate((selectedGifPath) => {
      return new Promise((resolve) => {
        const websocket = new WebSocket(`ws://${location.host}`);
        websocket.onopen = () => {
          websocket.send(JSON.stringify({ effect: 'gif', gifPath: selectedGifPath }));
          websocket.close();
          resolve();
        };
      });
    }, gifPath);

    // Helper injected into browser to classify canvas pixels
    const sampleAndClassify = `(() => {
      const leftCanvas = document.getElementById('left');
      if (!leftCanvas) return null;
      const ctx = leftCanvas.getContext('2d');
      const w = leftCanvas.width, h = leftCanvas.height;
      const samples = [];
      for (let sx = 0; sx < w; sx += Math.floor(w / 8)) {
        const p = ctx.getImageData(sx, Math.floor(h / 2), 1, 1).data;
        samples.push({ r: p[0], g: p[1], b: p[2] });
      }
      // Purple fallback: R≈B, G near 0, R>10 (post-processing shifts raw 0.3)
      const isPurplish = (px) => px.r > 10 && px.b > 10 && px.g < 15 && Math.abs(px.r - px.b) < 20;
      const allPurple = samples.every(isPurplish);
      return { samples, allPurple };
    })()`;

    // Phase 1: Wait until the purple fallback appears.
    // This confirms the GIF effect is active and the cache is empty.
    await page.waitForFunction(sampleAndClassify + '.allPurple', { timeout: WAIT_TIMEOUT });

    // Phase 2: Now wait for pixels to become NON-purple (the self-healing
    // fetch populates the cache and subsequent frames render GIF content).
    // If the fix is absent, this times out → test fails.
    const pixelSamples = await page.waitForFunction(
      `(() => { const r = ${sampleAndClassify}; return !r.allPurple ? JSON.stringify(r.samples) : false; })()`,
      { timeout: WAIT_TIMEOUT }
    );

    // Verify we got actual GIF content (varied pixels, not a flat color)
    const samples = JSON.parse(pixelSamples.jsonValue ? await pixelSamples.jsonValue() : pixelSamples.toString());
    const uniqueColors = new Set(samples.map(pixel => `${pixel.r},${pixel.g},${pixel.b}`));
    assert.ok(uniqueColors.size > 1, `Expected varied pixel colors from GIF, got ${uniqueColors.size} unique color(s)`);
  } catch (err) {
    if (page) await captureDebugInfo(page, 'gif-web-purple');
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
