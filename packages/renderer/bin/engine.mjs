import { start } from "../src/engine.mjs";
import { startServer } from "../src/server.mjs";

const configDirIndex = process.argv.findIndex(arg => arg === '--config-dir');
const configDir = configDirIndex !== -1 ? process.argv[configDirIndex + 1] : null;

if (!configDir) {
  console.error('Error: --config-dir <path> is required');
  process.exit(1);
}

startServer();
start(configDir);
