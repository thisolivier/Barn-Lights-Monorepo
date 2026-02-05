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

// Shared server process and port across all tests
let serverProcess;
let serverPort;

before(async () => {
  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  const { proc, port } = await startServerOnDynamicPort();
  serverProcess = proc;
  serverPort = port;

  await waitForServer(`http://127.0.0.1:${serverPort}`);
});

after(async () => {
  if (browser) await browser.close().catch(() => {});
  if (serverProcess) {
    serverProcess.kill();
    if (serverProcess.exitCode === null) {
      const exitTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Process exit timeout')), 5000)
      );
      await Promise.race([once(serverProcess, 'exit'), exitTimeout]).catch(() => {});
    }
  }
});

async function waitForServer(url, retries = 100) {
  for (let attemptIndex = 0; attemptIndex < retries; attemptIndex++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) {
        clearTimeout(timeoutId);
        return;
      }
    } catch (err) {
      console.log(`waitForServer: attempt ${attemptIndex + 1}/${retries} failed - ${err.name === 'AbortError' ? 'timeout' : err.message}`);
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

    // Page HTML snapshot
    const html = await page.content();
    const htmlPath = `test-failures/${testName}-${timestamp}.html`;
    await writeFile(htmlPath, html);
    console.error(`HTML snapshot saved: ${htmlPath}`);
  } catch (debugErr) {
    console.error('Failed to capture debug info:', debugErr.message);
  }
}

// Helper: navigate to calibration page and wait for React to mount
async function navigateToCalibrationPage(page) {
  await page.goto(`http://127.0.0.1:${serverPort}/#/calibration`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.calibration-page', { timeout: 10000 });
}

test('calibration page loads without console errors', async () => {
  let page;
  try {
    page = await browser.newPage();
    const consoleErrors = [];
    page.on('pageerror', err => consoleErrors.push(err));
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(new Error(msg.text()));
    });

    await page.goto(`http://127.0.0.1:${serverPort}/#/calibration`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.calibration-page', { timeout: 10000 });

    assert.equal(
      consoleErrors.length,
      0,
      `Expected no console errors but got: ${consoleErrors.map(err => err.message).join(', ')}`
    );
  } catch (err) {
    if (page) await captureDebugInfo(page, 'calibration-no-console-errors');
    throw err;
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

test('calibration page renders effect selector with calibration effects', async () => {
  let page;
  try {
    page = await browser.newPage();
    await navigateToCalibrationPage(page);

    const effectSelectorInfo = await page.evaluate(() => {
      const effectFieldset = Array.from(document.querySelectorAll('fieldset')).find(
        fieldset => fieldset.querySelector('legend')?.textContent?.includes('Effect')
          && !fieldset.querySelector('legend')?.textContent?.includes('Parameters')
      );
      if (!effectFieldset) return { exists: false, optionTexts: [] };

      const selectElement = effectFieldset.querySelector('select');
      if (!selectElement) return { exists: false, optionTexts: [] };

      const optionTexts = Array.from(selectElement.options).map(option => option.textContent);
      return { exists: true, optionTexts };
    });

    assert.ok(effectSelectorInfo.exists, 'Effect selector select element should exist');
    assert.equal(
      effectSelectorInfo.optionTexts.length,
      2,
      `Expected exactly 2 options but got ${effectSelectorInfo.optionTexts.length}: ${effectSelectorInfo.optionTexts.join(', ')}`
    );
    assert.ok(
      effectSelectorInfo.optionTexts.includes('Line Scanner'),
      `Expected "Line Scanner" option but got: ${effectSelectorInfo.optionTexts.join(', ')}`
    );
    assert.ok(
      effectSelectorInfo.optionTexts.includes('Section Highlighter'),
      `Expected "Section Highlighter" option but got: ${effectSelectorInfo.optionTexts.join(', ')}`
    );
  } catch (err) {
    if (page) await captureDebugInfo(page, 'calibration-effect-selector');
    throw err;
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

test('calibration page renders effect parameter controls for line scanner', async () => {
  let page;
  try {
    page = await browser.newPage();
    await navigateToCalibrationPage(page);

    const rangeInputCount = await page.evaluate(() => {
      const parametersFieldset = Array.from(document.querySelectorAll('fieldset')).find(
        fieldset => fieldset.querySelector('legend')?.textContent?.includes('Parameters')
      );
      if (!parametersFieldset) return 0;

      const rangeInputs = parametersFieldset.querySelectorAll('input[type="range"]');
      return rangeInputs.length;
    });

    assert.ok(
      rangeInputCount >= 2,
      `Expected at least 2 range inputs (positionX and positionY sliders) but found ${rangeInputCount}`
    );
  } catch (err) {
    if (page) await captureDebugInfo(page, 'calibration-effect-parameters');
    throw err;
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

test('calibration page renders section list', async () => {
  let page;
  try {
    page = await browser.newPage();
    await navigateToCalibrationPage(page);

    const sectionItemCount = await page.evaluate(() => {
      const sectionItems = document.querySelectorAll('.section-item');
      return sectionItems.length;
    });

    assert.ok(
      sectionItemCount >= 1,
      `Expected at least 1 section item but found ${sectionItemCount}`
    );
  } catch (err) {
    if (page) await captureDebugInfo(page, 'calibration-section-list');
    throw err;
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

test('calibration page renders position editor when section selected', async () => {
  let page;
  try {
    page = await browser.newPage();
    await navigateToCalibrationPage(page);

    // Click the first section item
    const sectionClicked = await page.evaluate(() => {
      const firstSectionItem = document.querySelector('.section-item');
      if (!firstSectionItem) return false;
      firstSectionItem.click();
      return true;
    });
    assert.ok(sectionClicked, 'Expected at least one .section-item to click');

    // Wait for the position editor to appear
    await page.waitForSelector('.position-editors', { timeout: 5000 });

    const positionEditorInfo = await page.evaluate(() => {
      const positionEditors = document.querySelector('.position-editors');
      if (!positionEditors) return { exists: false, numberInputCount: 0, hasSaveButton: false };

      const numberInputs = positionEditors.querySelectorAll('input[type="number"]');
      // Save button is a sibling of .position-editors inside the same fieldset
      const parentFieldset = positionEditors.closest('fieldset');
      const saveButton = parentFieldset?.querySelector('.save-btn');
      const hasSaveButton = saveButton !== null && saveButton.textContent.toLowerCase().includes('save');

      return {
        exists: true,
        numberInputCount: numberInputs.length,
        hasSaveButton
      };
    });

    assert.ok(positionEditorInfo.exists, 'Position editor (.position-editors) should exist after clicking a section');
    assert.equal(
      positionEditorInfo.numberInputCount,
      3,
      `Expected 3 number inputs (x0, x1, y) but found ${positionEditorInfo.numberInputCount}`
    );
    assert.ok(
      positionEditorInfo.hasSaveButton,
      'Expected a Save button within the position editor'
    );
  } catch (err) {
    if (page) await captureDebugInfo(page, 'calibration-position-editor');
    throw err;
  } finally {
    if (page) await page.close().catch(() => {});
  }
});
