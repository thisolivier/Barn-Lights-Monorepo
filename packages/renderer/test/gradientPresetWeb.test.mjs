import test from 'node:test';
import assert from 'assert/strict';
import { spawn } from 'child_process';
import { once } from 'events';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function waitForServer(url, retries = 100){
  for (let i=0;i<retries;i++){
    try{
      const res = await fetch(url);
      if(res.ok) return;
    } catch {}
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
    let stderr = '';
    let resolved = false;

    proc.stderr.on('data', chunk => {
      stderr += chunk.toString();
      // Look for SERVER_PORT=XXXXX in stderr
      const match = stderr.match(/SERVER_PORT=(\d+)/);
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
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!resolved) reject(new Error('Timeout waiting for server port'));
    }, 10000);
  });
}

test('loading preset updates preview gradient', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  let browser;
  try {
    await waitForServer(`http://127.0.0.1:${port}`);
    browser = await puppeteer.launch({ headless: 'new', args:['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => {
      const ctx = document.getElementById('left').getContext('2d');
      return ctx.getImageData(0,0,1,1).data[2] > 10;
    });
    const beforeBlue = await page.evaluate(() => {
      const ctx = document.getElementById('left').getContext('2d');
      return ctx.getImageData(0,0,1,1).data[2];
    });
    await page.evaluate(() => fetch('/preset/load/twoSolidColours'));
    await page.waitForFunction(() => {
      const ctx = document.getElementById('left').getContext('2d');
      return ctx.getImageData(0,0,1,1).data[2] < 10;
    });
    const afterBlue = await page.evaluate(() => {
      const ctx = document.getElementById('left').getContext('2d');
      return ctx.getImageData(0,0,1,1).data[2];
    });
    assert.ok(beforeBlue > 10);
    assert.ok(afterBlue < 10);
  } finally {
    if (browser) await browser.close().catch(()=>{});
    proc.kill();
    if (proc.exitCode === null) await once(proc, 'exit').catch(()=>{});
  }
});
