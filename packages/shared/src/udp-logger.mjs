import dgram from 'node:dgram';

/**
 * Log levels in order of severity (higher index = more severe)
 */
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

/**
 * Get numeric priority for a log level
 * @param {string} level - The log level
 * @returns {number} The priority (higher = more severe)
 */
function getLevelPriority(level) {
  const index = LOG_LEVELS.indexOf(level);
  return index === -1 ? 0 : index;
}

/**
 * Create a UDP logger instance
 * @param {Object} options - Logger configuration
 * @param {string} options.component - Component name for log entries
 * @param {Object} options.target - UDP target configuration
 * @param {string} options.target.host - Target host
 * @param {number} options.target.port - Target port
 * @param {string} [options.level='info'] - Minimum log level to send
 * @param {boolean} [options.fallbackToConsole=true] - Log to console if UDP fails
 * @returns {Object} Logger with error, warn, info, debug methods
 */
export function createLogger(options) {
  const {
    component,
    target,
    level = 'info',
    fallbackToConsole = true
  } = options;

  const minPriority = getLevelPriority(level);
  const socket = dgram.createSocket('udp4');
  // Don't let the socket keep the event loop alive
  socket.unref();

  /**
   * Send a log message
   * @param {string} logLevel - The log level
   * @param {string} msg - The log message
   * @param {Object} [meta={}] - Additional metadata
   */
  function log(logLevel, msg, meta = {}) {
    // Level filtering - only send if level >= configured threshold
    const messagePriority = getLevelPriority(logLevel);
    if (messagePriority < minPriority) {
      return;
    }

    const entry = {
      ts: new Date().toISOString(),
      level: logLevel,
      component,
      msg,
      ...meta
    };

    const buffer = Buffer.from(JSON.stringify(entry));

    socket.send(buffer, target.port, target.host, (err) => {
      if (err && fallbackToConsole) {
        const consoleFn = console[logLevel] || console.log;
        consoleFn(`[${entry.ts}] [${logLevel.toUpperCase()}] [${component}] ${msg}`, meta);
      }
    });
  }

  return {
    /**
     * Log an error message
     * @param {string} msg - The message
     * @param {Object} [meta] - Additional metadata
     */
    error(msg, meta) {
      log('error', msg, meta);
    },

    /**
     * Log a warning message
     * @param {string} msg - The message
     * @param {Object} [meta] - Additional metadata
     */
    warn(msg, meta) {
      log('warn', msg, meta);
    },

    /**
     * Log an info message
     * @param {string} msg - The message
     * @param {Object} [meta] - Additional metadata
     */
    info(msg, meta) {
      log('info', msg, meta);
    },

    /**
     * Log a debug message
     * @param {string} msg - The message
     * @param {Object} [meta] - Additional metadata
     */
    debug(msg, meta) {
      log('debug', msg, meta);
    },

    /**
     * Close the UDP socket
     */
    close() {
      socket.close();
    }
  };
}
