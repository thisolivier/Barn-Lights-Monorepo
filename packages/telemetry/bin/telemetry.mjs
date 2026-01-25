#!/usr/bin/env node

import { createUdpReceiver } from '../src/udp-receiver.mjs';
import { createLogBuffer } from '../src/log-buffer.mjs';
import { createAggregator } from '../src/aggregator.mjs';
import { createServer } from '../src/server.mjs';

// Default port configuration
const DEFAULTS = {
  httpPort: 3001,
  logPort: 49800,
  heartbeatPort: 49700
};

/**
 * Parse command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {object} Parsed options
 */
function parseArgs(args) {
  const options = { ...DEFAULTS };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--http-port':
        options.httpPort = parseInt(nextArg, 10);
        i++;
        break;
      case '--log-port':
        options.logPort = parseInt(nextArg, 10);
        i++;
        break;
      case '--heartbeat-port':
        options.heartbeatPort = parseInt(nextArg, 10);
        i++;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
Telemetry Service - Aggregates logs and heartbeats from LED light devices

Usage: telemetry [options]

Options:
  --http-port <port>       HTTP server port (default: ${DEFAULTS.httpPort})
  --log-port <port>        UDP port for log messages (default: ${DEFAULTS.logPort})
  --heartbeat-port <port>  UDP port for device heartbeats (default: ${DEFAULTS.heartbeatPort})
  -h, --help               Show this help message
`);
}

/**
 * Main entry point
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log('='.repeat(50));
  console.log('Telemetry Service Starting');
  console.log('='.repeat(50));
  console.log(`HTTP Port:      ${options.httpPort}`);
  console.log(`Log Port:       ${options.logPort}`);
  console.log(`Heartbeat Port: ${options.heartbeatPort}`);
  console.log('='.repeat(50));

  // Initialize components
  const logBuffer = createLogBuffer(1000);
  const aggregator = createAggregator({ heartbeatTimeout: 5000 });

  // Track receivers and server for cleanup
  const receivers = [];
  let httpServer = null;

  // Start HTTP/WebSocket server
  httpServer = await createServer({
    port: options.httpPort,
    logBuffer,
    aggregator
  });

  console.log('');
  console.log(`Dashboard: ${httpServer.url}`);
  console.log('');

  // Create log receiver
  const logReceiver = await createUdpReceiver(options.logPort, (data, rinfo) => {
    const entry = logBuffer.add({
      ...data,
      source: `${rinfo.address}:${rinfo.port}`
    });
    console.log(`[log] ${entry.level ?? 'info'} [${entry.component ?? 'unknown'}] ${entry.msg ?? JSON.stringify(data)}`);

    // Broadcast to WebSocket clients
    httpServer.broadcastLog(entry);
  });
  receivers.push(logReceiver);

  // Create heartbeat receiver
  const heartbeatReceiver = await createUdpReceiver(options.heartbeatPort, (data, rinfo) => {
    try {
      const deviceState = aggregator.updateDevice({
        ...data,
        source: `${rinfo.address}:${rinfo.port}`
      });
      console.log(`[heartbeat] ${deviceState.id} seq=${deviceState.lastSeq ?? 'N/A'} loss=${deviceState.packetLoss.toFixed(1)}%`);

      // Broadcast to WebSocket clients
      httpServer.broadcastHeartbeat(deviceState);
    } catch (err) {
      console.warn(`[heartbeat] Failed to process: ${err.message}`);
    }
  });
  receivers.push(heartbeatReceiver);

  console.log('Telemetry service is running. Press Ctrl+C to stop.');
  console.log('');

  // Graceful shutdown handler
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}, shutting down...`);

    // Close HTTP server
    if (httpServer) {
      await httpServer.close();
    }

    // Close all receivers
    await Promise.all(receivers.map(r => r.close()));

    // Log final stats
    const health = aggregator.getSystemHealth();
    console.log('\nFinal Statistics:');
    console.log(`  Logs buffered: ${logBuffer.size}`);
    console.log(`  Devices tracked: ${aggregator.deviceCount}`);
    console.log(`  System status: ${health.status}`);

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Export state for testing/extension
  return {
    logBuffer,
    aggregator,
    receivers,
    httpServer,
    options
  };
}

// Run main
main().catch((err) => {
  console.error('Failed to start telemetry service:', err);
  process.exit(1);
});
