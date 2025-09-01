import fs from 'fs';
import path from 'path';
import { loadLayout } from './config/load-layout.mjs';
import { loadConfig, validateLogLevel } from './config/load-config.mjs';
import { RendererProcess } from './renderer-process/index.mjs';
import { Mailbox } from './mailbox/index.mjs';
import { Assembler } from './assembler/index.mjs';
import { UdpSender } from './udp-sender/index.mjs';
import { Telemetry } from './telemetry/index.mjs';

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

export async function main(argv = process.argv) {
  try {
    const parsed = parseArgs(argv.slice(2));
    const configPath =
      parsed.config || path.resolve(process.cwd(), './config/sender.config.json');
    const config = loadConfig(configPath);
    const logLevel = parsed.logLevel || config.telemetry.log_level || 'info';
    if (!validateLogLevel(logLevel)) {
      throw new Error(`Invalid log level: ${logLevel}`);
    }
    const logger = createLogger(logLevel);
    logger.info(`Loaded configuration from ${configPath}`);

    const baseDir = path.dirname(configPath);
    if (config.sides) {
      for (const [side, layoutRel] of Object.entries(config.sides)) {
        let layoutPath = path.resolve(baseDir, layoutRel);
        if (!fs.existsSync(layoutPath)) {
          layoutPath = path.resolve(process.cwd(), layoutRel);
        }
        const layout = loadLayout(layoutPath, logger);
        const sideCfg = {
          ip: layout.static_ip.join('.'),
          portBase: layout.port_base,
          runs: layout.runs,
          total_leds: layout.total_leds,
          side: layout.side,
          layout,
        };
        config.sides[side] = sideCfg;
        logger.debug(`Loaded ${side} layout from ${layoutPath}`);
      }
    }

    const mailbox = new Mailbox();
    const rp = new RendererProcess(config, logger);
    const assembler = new Assembler(config, logger, mailbox);
    assembler.bindFrameEmitter(rp);
    const telemetry = new Telemetry(config, mailbox, logger);
    const sender = new UdpSender(config, mailbox, telemetry, logger);
    telemetry.bindRenderer(rp);
    telemetry.bindAssembler(assembler);

    rp.on('error', (err) => {
      logger.error(err.message);
      sender.stop();
      telemetry.stop();
      rp.stop();
      process.exit(2);
    });

    rp.start();
    sender.start();
    telemetry.start();

    const shutdown = () => {
      sender.stop();
      telemetry.stop();
      rp.stop();
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
