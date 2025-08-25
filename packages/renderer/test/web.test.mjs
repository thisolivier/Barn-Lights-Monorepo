import test from 'node:test';
import assert from 'assert/strict';
import { spawn } from 'child_process';
import { once } from 'events';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function waitForServer(url, retries = 100){
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server not responding');
}

test('web view loads with no console errors', async () => {
  const proc = spawn('node', ['src/engine.mjs'], { cwd: ROOT });
  let browser;
  try {
    await waitForServer('http://127.0.0.1:8080');

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(new Error(msg.text())); });

    await page.goto('http://127.0.0.1:8080', { waitUntil: 'networkidle0' });
    assert.equal(errors.length, 0);
  } finally {
    if (browser) await browser.close().catch(() => {});
    proc.kill();
    await once(proc, 'exit').catch(() => {});
  }
});
