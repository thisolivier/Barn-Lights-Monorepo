import test from 'node:test';
import assert from 'assert/strict';
import { spawn } from 'child_process';
import { once } from 'events';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

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

test('loading preset updates preview gradient', async () => {
  const proc = spawn('node', ['bin/engine.mjs', '--config-dir', '../../config'], { cwd: ROOT, stdio:['ignore','ignore','pipe'] });
  let browser;
  try {
    await waitForServer('http://127.0.0.1:8080');
    browser = await puppeteer.launch({ headless: 'new', args:['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:8080', { waitUntil: 'networkidle0' });
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
    if (proc.exitCode === null) {
      const exitTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Process exit timeout')), 5000)
      );
      await Promise.race([once(proc, 'exit'), exitTimeout]).catch(()=>{});
    }
  }
});
