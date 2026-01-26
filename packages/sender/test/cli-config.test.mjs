import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, spawnSync } from 'child_process';
import { withTimeout } from './helpers/timeout.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const binaryPath = path.join(__dirname, '..', 'bin', 'lights-sender.mjs');
const baseConfigPath = path.join(__dirname, 'fixtures', 'cli_renderer.config.json');
const baseConfig = JSON.parse(fs.readFileSync(baseConfigPath, 'utf8'));

function writeTempConfig(mutator) {
  const configObject = JSON.parse(JSON.stringify(baseConfig));
  mutator(configObject);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  const filePath = path.join(temporaryDirectory, 'sender.config.json');
  fs.writeFileSync(filePath, JSON.stringify(configObject));
  return filePath;
}

test('CLI accepts a valid configuration', async () => {
  const child = spawn('node', [binaryPath, '--config', baseConfigPath], { stdio: 'pipe' });
  await new Promise((resolve) => setTimeout(resolve, 500));
  child.kill('SIGINT');
  const exitCode = await withTimeout(
    new Promise((resolve) => child.on('exit', (code) => resolve(code))),
    5000,
    'Process exit timeout'
  );
  assert.strictEqual(exitCode, 0);
});

test('CLI fails when renderer command is missing', () => {
  const badPath = writeTempConfig((cfg) => { delete cfg.renderer.cmd; });
  const result = spawnSync('node', [binaryPath, '--config', badPath], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
});

test('CLI fails when telemetry interval is non-positive', () => {
  const badPath = writeTempConfig((cfg) => { cfg.telemetry.interval_ms = 0; });
  const result = spawnSync('node', [binaryPath, '--config', badPath], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
});

test('CLI fails when telemetry log level is invalid', () => {
  const badPath = writeTempConfig((cfg) => { cfg.telemetry.log_level = 'verbose'; });
  const result = spawnSync('node', [binaryPath, '--config', badPath], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
});
