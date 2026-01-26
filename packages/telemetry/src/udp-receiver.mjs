import dgram from 'node:dgram';

/**
 * Create a UDP receiver that listens for JSON messages on a specified port.
 *
 * @param {number} port - UDP port to listen on
 * @param {function} onMessage - Callback function called with parsed JSON messages
 * @returns {Promise<object>} Receiver object with close() method
 */
export async function createUdpReceiver(port, onMessage) {
  const socket = dgram.createSocket('udp4');

  socket.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString());
      onMessage(data, rinfo);
    } catch (err) {
      console.warn(`[udp-receiver] Failed to parse JSON from ${rinfo.address}:${rinfo.port}: ${err.message}`);
    }
  });

  socket.on('error', (err) => {
    console.error(`[udp-receiver] Socket error on port ${port}:`, err.message);
  });

  // Return a promise that resolves when the socket is bound
  return new Promise((resolve, reject) => {
    socket.once('error', reject);

    socket.bind(port, () => {
      socket.removeListener('error', reject);
      const address = socket.address();
      console.log(`[udp-receiver] Listening on port ${address.port}`);

      resolve({
        port: address.port,
        close() {
          return new Promise((resolveClose) => {
            socket.close(() => {
              console.log(`[udp-receiver] Closed port ${address.port}`);
              resolveClose();
            });
          });
        }
      });
    });
  });
}
