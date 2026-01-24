import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import dgram from 'node:dgram';
import { createUdpReceiver } from '../src/udp-receiver.mjs';

describe('UdpReceiver', () => {
  const receivers = [];

  after(async () => {
    // Clean up any open receivers
    await Promise.all(receivers.map(r => r.close()));
  });

  describe('createUdpReceiver()', () => {
    it('should bind to specified port', async () => {
      const receiver = await createUdpReceiver(0, () => {});
      receivers.push(receiver);
      assert.ok(receiver.port > 0);
    });

    it('should have close method', async () => {
      const receiver = await createUdpReceiver(0, () => {});
      receivers.push(receiver);
      assert.strictEqual(typeof receiver.close, 'function');
    });

    it('should receive and parse JSON messages', async () => {
      const received = [];
      const receiver = await createUdpReceiver(0, (data, rinfo) => {
        received.push({ data, rinfo });
      });
      receivers.push(receiver);

      // Send a test message
      const client = dgram.createSocket('udp4');
      const message = JSON.stringify({ type: 'test', value: 42 });

      await new Promise((resolve) => {
        client.send(message, receiver.port, '127.0.0.1', (err) => {
          client.close();
          resolve();
        });
      });

      // Wait for message to be received
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(received.length, 1);
      assert.deepStrictEqual(received[0].data, { type: 'test', value: 42 });
      assert.strictEqual(received[0].rinfo.address, '127.0.0.1');
    });

    it('should handle invalid JSON gracefully', async () => {
      const received = [];
      const receiver = await createUdpReceiver(0, (data) => {
        received.push(data);
      });
      receivers.push(receiver);

      // Send invalid JSON
      const client = dgram.createSocket('udp4');

      await new Promise((resolve) => {
        client.send('not valid json', receiver.port, '127.0.0.1', (err) => {
          client.close();
          resolve();
        });
      });

      // Wait for message to be processed
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should not have received anything (parse error is logged but not forwarded)
      assert.strictEqual(received.length, 0);
    });

    it('should close properly', async () => {
      const receiver = await createUdpReceiver(0, () => {});
      await receiver.close();
      // Verify closed by not adding to receivers array
    });
  });
});
