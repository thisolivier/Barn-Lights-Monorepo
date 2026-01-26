import { createLogger } from '@led-lights/shared/udp-logger';
import { start } from "../src/engine.mjs";
import { startServer } from "../src/server.mjs";

const logger = createLogger({
  component: 'renderer.engine',
  target: { host: '127.0.0.1', port: 49800 }
});

const configDirIndex = process.argv.findIndex(arg => arg === '--config-dir');
const configDir = configDirIndex !== -1 ? process.argv[configDirIndex + 1] : null;

const portIndex = process.argv.findIndex(arg => arg === '--port');
const port = portIndex !== -1 ? parseInt(process.argv[portIndex + 1], 10) : 8080;

if (!configDir) {
  logger.error('--config-dir <path> is required');
  process.exit(1);
}

(async () => {
  const assignedPort = await startServer(port);
  // Output port info to stdout for test harnesses to detect
  console.log(`SERVER_PORT=${assignedPort}`);
  start(configDir);
})();
