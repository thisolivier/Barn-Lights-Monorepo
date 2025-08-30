import fs from 'fs';
import path from 'path';

export function validateLogLevel(level) {
  return level === 'error' || level === 'warn' || level === 'info' || level === 'debug';
}

export function loadConfig(configPath) {
  const rawConfig = fs.readFileSync(configPath, 'utf8');
  const parsedConfig = JSON.parse(rawConfig);

  if (!parsedConfig.renderer || typeof parsedConfig.renderer.cmd !== 'string' || parsedConfig.renderer.cmd.length === 0) {
    throw new Error('renderer.cmd must be a non-empty string');
  }
  if (!Array.isArray(parsedConfig.renderer.args)) {
    throw new Error('renderer.args must be an array');
  }

  if (!parsedConfig.sides || typeof parsedConfig.sides !== 'object') {
    throw new Error('Missing sides configuration');
  }
  const baseDirectory = path.dirname(configPath);
  for (const [sideName, sideConfig] of Object.entries(parsedConfig.sides)) {
    if (typeof sideConfig.ip !== 'string') {
      throw new Error(`side ${sideName} ip must be a string`);
    }
    if (typeof sideConfig.portBase !== 'number') {
      throw new Error(`side ${sideName} portBase must be a number`);
    }
    if (typeof sideConfig.layout !== 'string') {
      throw new Error(`side ${sideName} layout must be a string`);
    }
    let layoutPath = path.resolve(baseDirectory, sideConfig.layout);
    if (!fs.existsSync(layoutPath)) {
      layoutPath = path.resolve(process.cwd(), sideConfig.layout);
      if (!fs.existsSync(layoutPath)) {
        throw new Error(`Layout file not found for side ${sideName}: ${sideConfig.layout}`);
      }
    }
  }

  if (!parsedConfig.telemetry) {
    throw new Error('Missing telemetry configuration');
  }
  const interval = parsedConfig.telemetry.interval_ms;
  if (!Number.isInteger(interval) || interval <= 0) {
    throw new Error('telemetry.interval_ms must be a positive integer');
  }
  const logLevel = parsedConfig.telemetry.log_level;
  if (logLevel && !validateLogLevel(logLevel)) {
    throw new Error(`Invalid telemetry.log_level: ${logLevel}`);
  }

  return parsedConfig;
}
