import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Minimal WebSocket server implementation using only Node.js built-ins.
 * Handles RFC 6455 WebSocket protocol for basic message passing.
 */
class WebSocketServer {
  #clients = new Set();

  /**
   * Upgrade an HTTP request to a WebSocket connection
   * @param {http.IncomingMessage} req
   * @param {net.Socket} socket
   * @param {Buffer} head
   */
  handleUpgrade(req, socket, head) {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    // Generate accept key per RFC 6455
    const acceptKey = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    // Send handshake response
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
      '\r\n'
    );

    // Track this client
    const client = {
      socket,
      send: (data) => this.#sendFrame(socket, data),
      close: () => {
        this.#clients.delete(client);
        socket.end();
      }
    };
    this.#clients.add(client);

    // Handle incoming messages
    socket.on('data', (buffer) => {
      this.#handleFrame(buffer, client);
    });

    socket.on('close', () => {
      this.#clients.delete(client);
    });

    socket.on('error', () => {
      this.#clients.delete(client);
    });

    return client;
  }

  /**
   * Parse a WebSocket frame
   * @param {Buffer} buffer
   * @param {object} client
   */
  #handleFrame(buffer, client) {
    if (buffer.length < 2) return;

    const firstByte = buffer[0];
    const opcode = firstByte & 0x0f;

    // Handle close frame (opcode 8)
    if (opcode === 8) {
      client.close();
      return;
    }

    // Handle ping (opcode 9) - respond with pong
    if (opcode === 9) {
      this.#sendPong(client.socket, buffer);
      return;
    }

    // Only handle text frames (opcode 1) for now
    if (opcode !== 1) return;

    const secondByte = buffer[1];
    const masked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      payloadLength = buffer.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      // For simplicity, we'll skip 64-bit lengths
      return;
    }

    if (masked) {
      const maskKey = buffer.slice(offset, offset + 4);
      offset += 4;
      const payload = buffer.slice(offset, offset + payloadLength);

      // Unmask the payload
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i % 4];
      }

      // We receive but don't currently process client messages
      // This could be extended to handle commands from the dashboard
    }
  }

  /**
   * Send a pong frame in response to ping
   * @param {net.Socket} socket
   * @param {Buffer} pingFrame
   */
  #sendPong(socket, pingFrame) {
    const pongFrame = Buffer.from(pingFrame);
    pongFrame[0] = (pongFrame[0] & 0xf0) | 0x0a; // Change opcode to pong
    socket.write(pongFrame);
  }

  /**
   * Send a text frame to a WebSocket client
   * @param {net.Socket} socket
   * @param {string|object} data
   */
  #sendFrame(socket, data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const payloadBuffer = Buffer.from(payload, 'utf8');
    const length = payloadBuffer.length;

    let header;
    if (length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81; // FIN + text frame
      header[1] = length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    try {
      socket.write(Buffer.concat([header, payloadBuffer]));
    } catch (err) {
      // Socket may be closed, remove client
      for (const client of this.#clients) {
        if (client.socket === socket) {
          this.#clients.delete(client);
          break;
        }
      }
    }
  }

  /**
   * Broadcast a message to all connected clients
   * @param {string|object} data
   */
  broadcast(data) {
    for (const client of this.#clients) {
      client.send(data);
    }
  }

  /**
   * Get the number of connected clients
   * @returns {number}
   */
  get clientCount() {
    return this.#clients.size;
  }

  /**
   * Close all client connections
   */
  closeAll() {
    for (const client of this.#clients) {
      client.close();
    }
    this.#clients.clear();
  }
}

/**
 * Create an HTTP server with WebSocket support for the telemetry dashboard.
 *
 * @param {object} options - Server configuration
 * @param {number} [options.port=3001] - HTTP port to listen on
 * @param {object} options.logBuffer - LogBuffer instance for log queries
 * @param {object} options.aggregator - Aggregator instance for device status
 * @param {function} [options.onLog] - Called with (entry) when a log is received (for broadcasting)
 * @param {function} [options.onHeartbeat] - Called with (device) when a heartbeat is received (for broadcasting)
 * @returns {Promise<object>} Server object with close() method and broadcast functions
 */
export async function createServer({ port = 3001, logBuffer, aggregator, onLog, onHeartbeat } = {}) {
  const wsServer = new WebSocketServer();

  // Serve static files from ui directory
  const uiDir = path.join(__dirname, 'ui');

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // CORS headers for API endpoints
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route handling
    if (pathname === '/' || pathname === '/index.html') {
      serveStaticFile(res, path.join(uiDir, 'index.html'), 'text/html');
    } else if (pathname === '/api/status') {
      handleApiStatus(res, logBuffer, aggregator);
    } else if (pathname === '/api/logs') {
      handleApiLogs(res, url, logBuffer);
    } else if (pathname === '/api/devices') {
      handleApiDevices(res, aggregator);
    } else if (pathname.startsWith('/ui/')) {
      // Serve static files from ui directory with /ui/ prefix
      const filePath = path.join(uiDir, pathname.slice(4));
      serveStaticFileWithType(res, filePath);
    } else if (pathname.match(/^\/(styles\.css|dashboard\.mjs)$/)) {
      // Serve dashboard assets from ui directory
      const filePath = path.join(uiDir, pathname.slice(1));
      serveStaticFileWithType(res, filePath);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  // Handle WebSocket upgrades
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/ws') {
      const client = wsServer.handleUpgrade(req, socket, head);
      if (client) {
        // Send initial state to new client
        const initMessage = {
          type: 'init',
          devices: aggregator?.getAllDevices() ?? [],
          recentLogs: logBuffer?.query({ limit: 50 }) ?? []
        };
        client.send(initMessage);
      }
    } else {
      socket.destroy();
    }
  });

  // Bind server
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  // Get actual port (important when port 0 was requested for ephemeral port)
  const actualPort = server.address().port;

  // Create broadcast functions
  const broadcastLog = (entry) => {
    wsServer.broadcast({ type: 'log', entry });
  };

  const broadcastHeartbeat = (device) => {
    wsServer.broadcast({ type: 'heartbeat', device });
  };

  return {
    port: actualPort,
    url: `http://localhost:${actualPort}`,

    /**
     * Broadcast a log entry to all connected WebSocket clients
     * @param {object} entry - Log entry to broadcast
     */
    broadcastLog,

    /**
     * Broadcast a device heartbeat to all connected WebSocket clients
     * @param {object} device - Device state to broadcast
     */
    broadcastHeartbeat,

    /**
     * Get the number of connected WebSocket clients
     * @returns {number}
     */
    get clientCount() {
      return wsServer.clientCount;
    },

    /**
     * Close the server and all connections
     * @returns {Promise<void>}
     */
    close() {
      return new Promise((resolve) => {
        wsServer.closeAll();
        server.close(() => resolve());
      });
    }
  };
}

/**
 * Serve a static file with the specified content type
 * @param {http.ServerResponse} res
 * @param {string} filePath
 * @param {string} contentType
 */
function serveStaticFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read file' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

/**
 * Serve a static file with automatic content type detection
 * @param {http.ServerResponse} res
 * @param {string} filePath
 */
function serveStaticFileWithType(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  const contentType = contentTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

/**
 * Handle GET /api/status
 * @param {http.ServerResponse} res
 * @param {object} logBuffer
 * @param {object} aggregator
 */
function handleApiStatus(res, logBuffer, aggregator) {
  const status = {
    systemHealth: aggregator?.getSystemHealth() ?? { status: 'unknown', totalDevices: 0 },
    devices: aggregator?.getAllDevices() ?? [],
    logBufferSize: logBuffer?.size ?? 0,
    logBufferMaxSize: logBuffer?.maxSize ?? 0,
    timestamp: Date.now()
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(status));
}

/**
 * Handle GET /api/logs
 * @param {http.ServerResponse} res
 * @param {URL} url
 * @param {object} logBuffer
 */
function handleApiLogs(res, url, logBuffer) {
  const level = url.searchParams.get('level') || undefined;
  const component = url.searchParams.get('component') || undefined;
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');

  const queryOptions = {
    level,
    component,
    limit: limit ? parseInt(limit, 10) : undefined,
    offset: offset ? parseInt(offset, 10) : undefined
  };

  const logs = logBuffer?.query(queryOptions) ?? [];

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ logs, total: logBuffer?.size ?? 0 }));
}

/**
 * Handle GET /api/devices
 * @param {http.ServerResponse} res
 * @param {object} aggregator
 */
function handleApiDevices(res, aggregator) {
  const devices = aggregator?.getAllDevices() ?? [];

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ devices }));
}
