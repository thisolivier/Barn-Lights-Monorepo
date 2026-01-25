import { createLogger } from '@led-lights/shared/udp-logger';
import { start } from "../src/engine.mjs";
import { startServer } from "../src/server.mjs";

const logger = createLogger({
  component: 'renderer.engine',
  target: { host: '127.0.0.1', port: 49800 }
});

const configDirIndex = process.argv.findIndex(arg => arg === '--config-dir');
const configDir = configDirIndex !== -1 ? process.argv[configDirIndex + 1] : null;

if (!configDir) {
  logger.error('--config-dir <path> is required');
  process.exit(1);
}

startServer();
start(configDir);
