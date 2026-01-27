import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// -------- Test Helpers --------

// Wait for server to be ready
async function waitForServer(url, retries = 100) {
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) {
        clearTimeout(timeoutId);
        return;
      }
    } catch {
      // Retry
    } finally {
      clearTimeout(timeoutId);
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server not responding');
}

// Start server on dynamic port and return process and port
async function startServerOnDynamicPort() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['bin/engine.mjs', '--config-dir', '../../config', '--port', '0'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let resolved = false;

    proc.stdout.on('data', chunk => {
      stdout += chunk.toString();
      const match = stdout.match(/SERVER_PORT=(\d+)/);
      if (match && !resolved) {
        resolved = true;
        resolve({ proc, port: parseInt(match[1], 10) });
      }
    });

    proc.on('error', (err) => {
      if (!resolved) reject(err);
    });
    proc.on('exit', (code) => {
      if (!resolved && code !== null && code !== 0) {
        reject(new Error(`Process exited with code ${code}: ${stdout}`));
      }
    });

    setTimeout(() => {
      if (!resolved) reject(new Error('Timeout waiting for server port'));
    }, 10000);
  });
}

// Create a WebSocket connection with message collection
async function createTestClient(port, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages = [];
    let resolved = false;

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }
    }, timeout);

    ws.on('open', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        resolve({ ws, messages });
      }
    });

    ws.on('message', (data) => {
      try {
        messages.push(JSON.parse(data.toString()));
      } catch {
        messages.push(data.toString());
      }
    });

    ws.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        reject(err);
      }
    });
  });
}

// Wait for a message of a specific type
async function waitForMessage(messages, type, startIndex = 0, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (let i = startIndex; i < messages.length; i++) {
      if (messages[i].type === type) {
        return { message: messages[i], index: i };
      }
    }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`Timeout waiting for message type: ${type}`);
}

// -------- Tests --------

test('audio-websocket: new connection receives initial audio state', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  let client;

  try {
    await waitForServer(`http://127.0.0.1:${port}`);

    client = await createTestClient(port);

    // Wait for init and audio messages
    await waitForMessage(client.messages, 'init');
    const { message: audioMsg } = await waitForMessage(client.messages, 'audio');

    // Verify audio state structure
    assert.ok(audioMsg.audio, 'Audio message should have audio field');
    assert.equal(typeof audioMsg.audio.rms, 'number', 'rms should be a number');
    assert.equal(typeof audioMsg.audio.bass, 'number', 'bass should be a number');
    assert.equal(typeof audioMsg.audio.mids, 'number', 'mids should be a number');
    assert.equal(typeof audioMsg.audio.highs, 'number', 'highs should be a number');
    assert.equal(typeof audioMsg.audio.beat, 'boolean', 'beat should be a boolean');
    assert.equal(typeof audioMsg.audio.enabled, 'boolean', 'enabled should be a boolean');
    assert.ok(audioMsg.audio.effects, 'effects should exist');
    assert.ok(audioMsg.audio.effects.brightness, 'brightness effect should exist');
    assert.ok(audioMsg.audio.effects.horizontalMask, 'horizontalMask effect should exist');
    assert.ok(audioMsg.audio.effects.hueShift, 'hueShift effect should exist');
  } finally {
    if (client && client.ws) client.ws.close();
    proc.kill();
    if (proc.exitCode === null) {
      await Promise.race([
        once(proc, 'exit'),
        new Promise((_, r) => setTimeout(() => r(new Error('exit timeout')), 5000))
      ]).catch(() => {});
    }
  }
});

test('audio-websocket: server handles type=audio messages', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  let audioClient, uiClient;

  try {
    await waitForServer(`http://127.0.0.1:${port}`);

    // Connect two clients - one simulating audio input, one simulating UI
    audioClient = await createTestClient(port);
    uiClient = await createTestClient(port);

    // Wait for initial messages on UI client
    await waitForMessage(uiClient.messages, 'audio');
    const initialMsgCount = uiClient.messages.length;

    // Send audio data from audio client
    const audioData = {
      type: 'audio',
      rms: 0.75,
      bass: 0.9,
      mids: 0.5,
      highs: 0.3,
      beat: true
    };
    audioClient.ws.send(JSON.stringify(audioData));

    // Wait for the broadcast to UI client
    const { message: broadcastMsg } = await waitForMessage(uiClient.messages, 'audio', initialMsgCount);

    // Verify the broadcast contains updated audio state
    assert.equal(broadcastMsg.audio.rms, 0.75, 'rms should be updated');
    assert.equal(broadcastMsg.audio.bass, 0.9, 'bass should be updated');
    assert.equal(broadcastMsg.audio.mids, 0.5, 'mids should be updated');
    assert.equal(broadcastMsg.audio.highs, 0.3, 'highs should be updated');
    assert.equal(broadcastMsg.audio.beat, true, 'beat should be updated');
  } finally {
    if (audioClient && audioClient.ws) audioClient.ws.close();
    if (uiClient && uiClient.ws) uiClient.ws.close();
    proc.kill();
    if (proc.exitCode === null) {
      await Promise.race([
        once(proc, 'exit'),
        new Promise((_, r) => setTimeout(() => r(new Error('exit timeout')), 5000))
      ]).catch(() => {});
    }
  }
});

test('audio-websocket: server handles type=audioSettings messages', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  let uiClient1, uiClient2;

  try {
    await waitForServer(`http://127.0.0.1:${port}`);

    // Connect two UI clients
    uiClient1 = await createTestClient(port);
    uiClient2 = await createTestClient(port);

    // Wait for initial messages
    await waitForMessage(uiClient1.messages, 'audio');
    await waitForMessage(uiClient2.messages, 'audio');

    const initialMsgCount = uiClient2.messages.length;

    // Send audioSettings from client 1
    const settingsUpdate = {
      type: 'audioSettings',
      settings: {
        enabled: true,
        effects: {
          brightness: { enabled: true, intensity: 0.8 },
          hueShift: { enabled: true, amount: 45 }
        }
      }
    };
    uiClient1.ws.send(JSON.stringify(settingsUpdate));

    // Wait for broadcast to client 2
    const { message: broadcastMsg } = await waitForMessage(uiClient2.messages, 'audio', initialMsgCount);

    // Verify settings were applied
    assert.equal(broadcastMsg.audio.enabled, true, 'enabled should be true');
    assert.equal(broadcastMsg.audio.effects.brightness.enabled, true, 'brightness should be enabled');
    assert.equal(broadcastMsg.audio.effects.brightness.intensity, 0.8, 'brightness intensity should be 0.8');
    assert.equal(broadcastMsg.audio.effects.hueShift.enabled, true, 'hueShift should be enabled');
    assert.equal(broadcastMsg.audio.effects.hueShift.amount, 45, 'hueShift amount should be 45');
  } finally {
    if (uiClient1 && uiClient1.ws) uiClient1.ws.close();
    if (uiClient2 && uiClient2.ws) uiClient2.ws.close();
    proc.kill();
    if (proc.exitCode === null) {
      await Promise.race([
        once(proc, 'exit'),
        new Promise((_, r) => setTimeout(() => r(new Error('exit timeout')), 5000))
      ]).catch(() => {});
    }
  }
});

test('audio-websocket: audio state is broadcast to all connected clients', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  const clients = [];

  try {
    await waitForServer(`http://127.0.0.1:${port}`);

    // Connect 3 clients
    for (let i = 0; i < 3; i++) {
      clients.push(await createTestClient(port));
    }

    // Wait for initial messages on all clients
    for (const client of clients) {
      await waitForMessage(client.messages, 'audio');
    }

    const initialCounts = clients.map(c => c.messages.length);

    // Send audio data from first client
    const audioData = {
      type: 'audio',
      rms: 0.42,
      bass: 0.55,
      mids: 0.33,
      highs: 0.77,
      beat: false
    };
    clients[0].ws.send(JSON.stringify(audioData));

    // Wait for broadcast on all clients (including sender)
    for (let i = 0; i < clients.length; i++) {
      const { message } = await waitForMessage(clients[i].messages, 'audio', initialCounts[i]);
      assert.equal(message.audio.rms, 0.42, `Client ${i} should receive updated rms`);
      assert.equal(message.audio.bass, 0.55, `Client ${i} should receive updated bass`);
    }
  } finally {
    for (const client of clients) {
      if (client.ws) client.ws.close();
    }
    proc.kill();
    if (proc.exitCode === null) {
      await Promise.race([
        once(proc, 'exit'),
        new Promise((_, r) => setTimeout(() => r(new Error('exit timeout')), 5000))
      ]).catch(() => {});
    }
  }
});

test('audio-websocket: new client receives current audio state', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  let audioClient, lateClient;

  try {
    await waitForServer(`http://127.0.0.1:${port}`);

    // First client sends audio data
    audioClient = await createTestClient(port);
    await waitForMessage(audioClient.messages, 'audio');

    const audioData = {
      type: 'audio',
      rms: 0.88,
      bass: 0.99,
      mids: 0.11,
      highs: 0.22,
      beat: true
    };
    audioClient.ws.send(JSON.stringify(audioData));

    // Wait a bit for state to be updated
    await new Promise(r => setTimeout(r, 100));

    // Late client connects and should receive current state
    lateClient = await createTestClient(port);
    const { message: initAudio } = await waitForMessage(lateClient.messages, 'audio');

    // Verify late client received updated state
    assert.equal(initAudio.audio.rms, 0.88, 'Late client should receive current rms');
    assert.equal(initAudio.audio.bass, 0.99, 'Late client should receive current bass');
    assert.equal(initAudio.audio.mids, 0.11, 'Late client should receive current mids');
    assert.equal(initAudio.audio.highs, 0.22, 'Late client should receive current highs');
  } finally {
    if (audioClient && audioClient.ws) audioClient.ws.close();
    if (lateClient && lateClient.ws) lateClient.ws.close();
    proc.kill();
    if (proc.exitCode === null) {
      await Promise.race([
        once(proc, 'exit'),
        new Promise((_, r) => setTimeout(() => r(new Error('exit timeout')), 5000))
      ]).catch(() => {});
    }
  }
});

test('audio-websocket: partial audio updates preserve existing state', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  let client;

  try {
    await waitForServer(`http://127.0.0.1:${port}`);

    client = await createTestClient(port);
    await waitForMessage(client.messages, 'audio');

    // Record message count before first send
    let msgCount = client.messages.length;

    // Send full audio state
    const fullUpdate = {
      type: 'audio',
      rms: 0.5,
      bass: 0.6,
      mids: 0.4,
      highs: 0.3,
      beat: false
    };
    client.ws.send(JSON.stringify(fullUpdate));

    // Wait for broadcast of first update - look for message with our rms value
    let firstBroadcast;
    const start = Date.now();
    while (Date.now() - start < 5000) {
      for (let i = msgCount; i < client.messages.length; i++) {
        const msg = client.messages[i];
        if (msg.type === 'audio' && msg.audio.rms === 0.5) {
          firstBroadcast = msg;
          break;
        }
      }
      if (firstBroadcast) break;
      await new Promise(r => setTimeout(r, 50));
    }
    assert.ok(firstBroadcast, 'Should receive first audio broadcast');

    // Update message count after first broadcast
    msgCount = client.messages.length;

    // Send partial update - only rms and beat
    const partialUpdate = {
      type: 'audio',
      rms: 0.9,
      beat: true
    };
    client.ws.send(JSON.stringify(partialUpdate));

    // Wait for second broadcast with updated rms
    let secondBroadcast;
    const start2 = Date.now();
    while (Date.now() - start2 < 5000) {
      for (let i = msgCount; i < client.messages.length; i++) {
        const msg = client.messages[i];
        if (msg.type === 'audio' && msg.audio.rms === 0.9) {
          secondBroadcast = msg;
          break;
        }
      }
      if (secondBroadcast) break;
      await new Promise(r => setTimeout(r, 50));
    }
    assert.ok(secondBroadcast, 'Should receive second audio broadcast');

    // Verify partial update preserved other values
    assert.equal(secondBroadcast.audio.rms, 0.9, 'rms should be updated');
    assert.equal(secondBroadcast.audio.beat, true, 'beat should be updated');
    assert.equal(secondBroadcast.audio.bass, 0.6, 'bass should be preserved');
    assert.equal(secondBroadcast.audio.mids, 0.4, 'mids should be preserved');
    assert.equal(secondBroadcast.audio.highs, 0.3, 'highs should be preserved');
  } finally {
    if (client && client.ws) client.ws.close();
    proc.kill();
    if (proc.exitCode === null) {
      await Promise.race([
        once(proc, 'exit'),
        new Promise((_, r) => setTimeout(() => r(new Error('exit timeout')), 5000))
      ]).catch(() => {});
    }
  }
});

test('audio-websocket: audioSettings updates are merged correctly', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  let client;

  try {
    await waitForServer(`http://127.0.0.1:${port}`);

    client = await createTestClient(port);
    await waitForMessage(client.messages, 'audio');

    // Enable brightness effect
    let msgCount = client.messages.length;
    client.ws.send(JSON.stringify({
      type: 'audioSettings',
      settings: {
        effects: {
          brightness: { enabled: true, intensity: 0.7 }
        }
      }
    }));

    await waitForMessage(client.messages, 'audio', msgCount);
    msgCount = client.messages.length;

    // Now update only hueShift - brightness should remain enabled
    client.ws.send(JSON.stringify({
      type: 'audioSettings',
      settings: {
        effects: {
          hueShift: { enabled: true, amount: 60 }
        }
      }
    }));

    const { message } = await waitForMessage(client.messages, 'audio', msgCount);

    // Verify both effects are properly set
    assert.equal(message.audio.effects.brightness.enabled, true, 'brightness should remain enabled');
    assert.equal(message.audio.effects.brightness.intensity, 0.7, 'brightness intensity should remain 0.7');
    assert.equal(message.audio.effects.hueShift.enabled, true, 'hueShift should be enabled');
    assert.equal(message.audio.effects.hueShift.amount, 60, 'hueShift amount should be 60');
  } finally {
    if (client && client.ws) client.ws.close();
    proc.kill();
    if (proc.exitCode === null) {
      await Promise.race([
        once(proc, 'exit'),
        new Promise((_, r) => setTimeout(() => r(new Error('exit timeout')), 5000))
      ]).catch(() => {});
    }
  }
});

test('audio-websocket: invalid JSON messages are handled gracefully', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  let client;

  try {
    await waitForServer(`http://127.0.0.1:${port}`);

    client = await createTestClient(port);
    await waitForMessage(client.messages, 'audio');

    const initialCount = client.messages.length;

    // Send invalid JSON - server should not crash
    client.ws.send('not valid json {{{');

    // Send valid message after invalid one
    client.ws.send(JSON.stringify({
      type: 'audio',
      rms: 0.33
    }));

    // Should still receive valid broadcast
    const { message } = await waitForMessage(client.messages, 'audio', initialCount);
    assert.equal(message.audio.rms, 0.33, 'Server should continue processing after invalid message');
  } finally {
    if (client && client.ws) client.ws.close();
    proc.kill();
    if (proc.exitCode === null) {
      await Promise.race([
        once(proc, 'exit'),
        new Promise((_, r) => setTimeout(() => r(new Error('exit timeout')), 5000))
      ]).catch(() => {});
    }
  }
});

test('audio-websocket: regular param messages still work alongside audio', async () => {
  const { proc, port } = await startServerOnDynamicPort();
  let client;

  try {
    await waitForServer(`http://127.0.0.1:${port}`);

    client = await createTestClient(port);
    await waitForMessage(client.messages, 'init');
    const initialCount = client.messages.length;

    // Send a regular param update (not audio)
    client.ws.send(JSON.stringify({
      brightness: 0.8
    }));

    // Should receive params broadcast
    const { message } = await waitForMessage(client.messages, 'params', initialCount);
    assert.ok(message.params, 'Should receive params message');

    // Now send audio - should still work
    client.ws.send(JSON.stringify({
      type: 'audio',
      rms: 0.55
    }));

    const { message: audioMsg } = await waitForMessage(client.messages, 'audio', initialCount);
    assert.equal(audioMsg.audio.rms, 0.55, 'Audio messages should still work');
  } finally {
    if (client && client.ws) client.ws.close();
    proc.kill();
    if (proc.exitCode === null) {
      await Promise.race([
        once(proc, 'exit'),
        new Promise((_, r) => setTimeout(() => r(new Error('exit timeout')), 5000))
      ]).catch(() => {});
    }
  }
});
