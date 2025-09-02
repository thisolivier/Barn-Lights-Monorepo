import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'dgram';
import { UdpSender } from '../src/udp-sender/index.mjs';
import { Mailbox } from '../src/mailbox/index.mjs';

test('sendRebootSignal sends a byte to port base plus one hundred', async () => {
  const udpServer = dgram.createSocket('udp4');
  await new Promise((resolve) => udpServer.bind(0, resolve));
  const rebootPort = udpServer.address().port;
  const portBase = rebootPort - 100;
  const runtimeConfig = {
    sides: {
      left: { ip: '127.0.0.1', portBase, runs: [] },
    },
  };
  const mailbox = new Mailbox();
  const sender = new UdpSender(runtimeConfig, mailbox);
  sender.start();
  const received = new Promise((resolve) => {
    udpServer.once('message', (msg) => resolve(msg));
  });
  sender.sendRebootSignal('left');
  const message = await received;
  assert.strictEqual(message.length, 1);
  sender.stop();
  udpServer.close();
});
