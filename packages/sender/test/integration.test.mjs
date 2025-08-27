import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import dgram from 'dgram';
import { fileURLToPath } from 'url';
import { RendererProcess } from '../src/renderer-process/index.mjs';
import { Assembler } from '../src/assembler/index.mjs';
import { Mailbox } from '../src/mailbox/index.mjs';
import { UdpSender } from '../src/udp-sender/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const layoutPath = path.join(__dirname, '..', 'config', 'left.json');
const leftLayout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));

function buildConfig(portBase) {
  return {
    renderer: {
      cmd: process.execPath,
      args: [path.join(__dirname, 'fixtures', 'renderer_loop.mjs')],
    },
    sides: {
      left: {
        ...leftLayout,
        ip: '127.0.0.1',
        portBase,
      },
    },
  };
}

test('assembler writes frames from looped renderer into mailbox', async () => {
  const runtimeConfig = buildConfig(50000);
  const mailbox = new Mailbox();
  const renderer = new RendererProcess(runtimeConfig);
  renderer.on('error', () => {});
  const assembler = new Assembler(runtimeConfig, console, mailbox);
  assembler.bindFrameEmitter(renderer);

  renderer.start();
  await new Promise((resolve) => setTimeout(resolve, 300));
  renderer.stop();
  await new Promise((resolve) => setTimeout(resolve, 50));

  const frame = mailbox.take('left');
  assert(frame, 'expected mailbox to contain an assembled frame');
  assert.strictEqual(frame.runs.length, leftLayout.runs.length);
});

test('udp sender transmits packets for assembled frames', async () => {
  const udpServer = dgram.createSocket('udp4');
  await new Promise((resolve) => udpServer.bind(0, resolve));
  const portBase = udpServer.address().port;
  const runtimeConfig = buildConfig(portBase);
  const mailbox = new Mailbox();
  const renderer = new RendererProcess(runtimeConfig);
  renderer.on('error', () => {});
  const assembler = new Assembler(runtimeConfig, console, mailbox);
  assembler.bindFrameEmitter(renderer);
  const sender = new UdpSender(runtimeConfig, mailbox);

  const receivedPackets = [];
  udpServer.on('message', (msg) => receivedPackets.push(msg));

  renderer.start();
  sender.start();
  await new Promise((resolve) => setTimeout(resolve, 300));
  sender.stop();
  renderer.stop();
  await new Promise((resolve) => setTimeout(resolve, 50));
  udpServer.close();

  assert(receivedPackets.length > 0, 'expected at least one UDP packet');
  const expectedLength = 4 + leftLayout.runs[0].led_count * 3;
  assert.strictEqual(receivedPackets[0].length, expectedLength);
});
