import fs from 'fs';
import path from 'path';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface TelemetryConfig {
  log_level?: LogLevel;
  [key: string]: any;
}

interface SenderConfig {
  telemetry: TelemetryConfig;
  [key: string]: any;
}

interface ParsedArgs {
  config?: string;
  logLevel?: LogLevel;
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config' && i + 1 < argv.length) {
      result.config = argv[++i];
    } else if (arg === '--log-level' && i + 1 < argv.length) {
      result.logLevel = argv[++i] as LogLevel;
    }
  }
  return result;
}

function validateLogLevel(level: any): level is LogLevel {
  return level === 'error' || level === 'warn' || level === 'info' || level === 'debug';
}

function loadConfig(configPath: string): SenderConfig {
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.telemetry) {
    throw new Error('Missing telemetry configuration');
  }
  const lvl = parsed.telemetry.log_level;
  if (lvl && !validateLogLevel(lvl)) {
    throw new Error(`Invalid telemetry.log_level: ${lvl}`);
  }
  return parsed as SenderConfig;
}

function createLogger(level: LogLevel) {
  const order: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
  const threshold = order[level];
  function shouldLog(l: LogLevel) {
    return order[l] <= threshold;
  }
  return {
    error: (...args: any[]) => { if (shouldLog('error')) console.error(...args); },
    warn: (...args: any[]) => { if (shouldLog('warn')) console.warn(...args); },
    info: (...args: any[]) => { if (shouldLog('info')) console.info(...args); },
    debug: (...args: any[]) => { if (shouldLog('debug')) console.debug(...args); },
  };
}

export async function main(argv = process.argv): Promise<number> {
  try {
    const parsed = parseArgs(argv.slice(2));
    const configPath = parsed.config || path.resolve(process.cwd(), './config/sender.config.json');
    const config = loadConfig(configPath);
    const logLevel: LogLevel = parsed.logLevel || config.telemetry.log_level || 'info';
    if (!validateLogLevel(logLevel)) {
      throw new Error(`Invalid log level: ${logLevel}`);
    }
    const logger = createLogger(logLevel);
    logger.info(`Loaded configuration from ${configPath}`);
    return 0;
  } catch (err: any) {
    console.error(err.message);
    return 1;
  }
}
