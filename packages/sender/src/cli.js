const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config' && i + 1 < argv.length) {
      result.config = argv[++i];
    } else if (arg === '--log-level' && i + 1 < argv.length) {
      result.logLevel = argv[++i];
    }
  }
  return result;
}

function validateLogLevel(level) {
  return level === 'error' || level === 'warn' || level === 'info' || level === 'debug';
}

function loadConfig(configPath) {
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.telemetry) {
    throw new Error('Missing telemetry configuration');
  }
  const lvl = parsed.telemetry.log_level;
  if (lvl && !validateLogLevel(lvl)) {
    throw new Error(`Invalid telemetry.log_level: ${lvl}`);
  }
  return parsed;
}

function createLogger(level) {
  const order = { error: 0, warn: 1, info: 2, debug: 3 };
  const threshold = order[level];
  function shouldLog(l) {
    return order[l] <= threshold;
  }
  return {
    error: (...args) => { if (shouldLog('error')) console.error(...args); },
    warn: (...args) => { if (shouldLog('warn')) console.warn(...args); },
    info: (...args) => { if (shouldLog('info')) console.info(...args); },
    debug: (...args) => { if (shouldLog('debug')) console.debug(...args); },
  };
}

async function main(argv = process.argv) {
  try {
    const parsed = parseArgs(argv.slice(2));
    const configPath = parsed.config || path.resolve(process.cwd(), './config/sender.config.json');
    const config = loadConfig(configPath);
    const logLevel = parsed.logLevel || config.telemetry.log_level || 'info';
    if (!validateLogLevel(logLevel)) {
      throw new Error(`Invalid log level: ${logLevel}`);
    }
    const logger = createLogger(logLevel);
    logger.info(`Loaded configuration from ${configPath}`);
    return 0;
  } catch (err) {
    console.error(err.message);
    return 1;
  }
}

module.exports = { main };
