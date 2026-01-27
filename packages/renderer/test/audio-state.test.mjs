import test from 'node:test';
import assert from 'node:assert/strict';

// We need to import the functions and reset state between tests
import { audioState, updateAudioState, updateAudioSettings } from '../src/audio-state.mjs';

// Helper to reset audioState to initial values
function resetAudioState() {
  audioState.rms = 0;
  audioState.bass = 0;
  audioState.mids = 0;
  audioState.highs = 0;
  audioState.beat = false;
  audioState.lastBeatTime = 0;
  audioState.enabled = true;
  audioState.effects = {
    brightness: { enabled: false, intensity: 1.0 },
    horizontalMask: { enabled: false },
    hueShift: { enabled: false, amount: 30 }
  };
}

test('audio-state: initial state values are correct', () => {
  resetAudioState();

  assert.equal(audioState.rms, 0, 'rms should start at 0');
  assert.equal(audioState.bass, 0, 'bass should start at 0');
  assert.equal(audioState.mids, 0, 'mids should start at 0');
  assert.equal(audioState.highs, 0, 'highs should start at 0');
  assert.equal(audioState.beat, false, 'beat should start as false');
  assert.equal(audioState.lastBeatTime, 0, 'lastBeatTime should start at 0');
  assert.equal(audioState.enabled, true, 'enabled should start as true');

  // Check effect defaults
  assert.equal(audioState.effects.brightness.enabled, false, 'brightness effect should be disabled by default');
  assert.equal(audioState.effects.brightness.intensity, 1.0, 'brightness intensity should default to 1.0');
  assert.equal(audioState.effects.horizontalMask.enabled, false, 'horizontalMask should be disabled by default');
  assert.equal(audioState.effects.hueShift.enabled, false, 'hueShift should be disabled by default');
  assert.equal(audioState.effects.hueShift.amount, 30, 'hueShift amount should default to 30');
});

test('audio-state: updateAudioState updates all audio fields', () => {
  resetAudioState();

  const data = {
    rms: 0.75,
    bass: 0.9,
    mids: 0.5,
    highs: 0.3,
    beat: true
  };

  updateAudioState(data);

  assert.equal(audioState.rms, 0.75, 'rms should be updated');
  assert.equal(audioState.bass, 0.9, 'bass should be updated');
  assert.equal(audioState.mids, 0.5, 'mids should be updated');
  assert.equal(audioState.highs, 0.3, 'highs should be updated');
  assert.equal(audioState.beat, true, 'beat should be updated');
  assert.ok(audioState.lastBeatTime > 0, 'lastBeatTime should be set when beat is true');
});

test('audio-state: updateAudioState handles partial updates', () => {
  resetAudioState();

  // Set initial values
  updateAudioState({ rms: 0.5, bass: 0.6, mids: 0.4, highs: 0.3, beat: false });

  // Partial update - only rms and bass
  updateAudioState({ rms: 0.8, bass: 0.9 });

  assert.equal(audioState.rms, 0.8, 'rms should be updated');
  assert.equal(audioState.bass, 0.9, 'bass should be updated');
  assert.equal(audioState.mids, 0.4, 'mids should remain unchanged');
  assert.equal(audioState.highs, 0.3, 'highs should remain unchanged');
});

test('audio-state: updateAudioState only updates lastBeatTime when beat is true', () => {
  resetAudioState();

  // First update with beat = false
  updateAudioState({ beat: false });
  assert.equal(audioState.lastBeatTime, 0, 'lastBeatTime should remain 0 when beat is false');

  // Update with beat = true
  const beforeBeat = Date.now();
  updateAudioState({ beat: true });
  const afterBeat = Date.now();

  assert.ok(audioState.lastBeatTime >= beforeBeat, 'lastBeatTime should be after test start');
  assert.ok(audioState.lastBeatTime <= afterBeat, 'lastBeatTime should be before test end');

  // Save the beat time
  const savedBeatTime = audioState.lastBeatTime;

  // Update with beat = false - should not change lastBeatTime
  updateAudioState({ beat: false });
  assert.equal(audioState.lastBeatTime, savedBeatTime, 'lastBeatTime should not change when beat is false');
});

test('audio-state: updateAudioState ignores invalid data types', () => {
  resetAudioState();

  // Set known values first
  updateAudioState({ rms: 0.5, beat: true });
  const savedBeatTime = audioState.lastBeatTime;

  // Try to update with invalid types
  updateAudioState({ rms: 'invalid', beat: 'not a boolean', bass: null });

  assert.equal(audioState.rms, 0.5, 'rms should remain unchanged with invalid string');
  assert.equal(audioState.beat, true, 'beat should remain unchanged with invalid string');
  assert.equal(audioState.lastBeatTime, savedBeatTime, 'lastBeatTime should remain unchanged');
});

test('audio-state: updateAudioSettings enables/disables audio', () => {
  resetAudioState();

  assert.equal(audioState.enabled, true, 'enabled should start as true');

  updateAudioSettings({ enabled: false });
  assert.equal(audioState.enabled, false, 'enabled should be set to false');

  updateAudioSettings({ enabled: true });
  assert.equal(audioState.enabled, true, 'enabled should be set to true');
});

test('audio-state: updateAudioSettings merges brightness effect settings', () => {
  resetAudioState();

  // Enable brightness effect
  updateAudioSettings({
    effects: {
      brightness: { enabled: true, intensity: 0.8 }
    }
  });

  assert.equal(audioState.effects.brightness.enabled, true, 'brightness should be enabled');
  assert.equal(audioState.effects.brightness.intensity, 0.8, 'brightness intensity should be 0.8');

  // Update only intensity, keeping enabled
  updateAudioSettings({
    effects: {
      brightness: { intensity: 1.2 }
    }
  });

  assert.equal(audioState.effects.brightness.enabled, true, 'brightness should remain enabled');
  assert.equal(audioState.effects.brightness.intensity, 1.2, 'brightness intensity should be updated to 1.2');
});

test('audio-state: updateAudioSettings merges horizontalMask effect settings', () => {
  resetAudioState();

  updateAudioSettings({
    effects: {
      horizontalMask: { enabled: true }
    }
  });

  assert.equal(audioState.effects.horizontalMask.enabled, true, 'horizontalMask should be enabled');

  // Other effects should remain unchanged
  assert.equal(audioState.effects.brightness.enabled, false, 'brightness should remain disabled');
  assert.equal(audioState.effects.hueShift.enabled, false, 'hueShift should remain disabled');
});

test('audio-state: updateAudioSettings merges hueShift effect settings', () => {
  resetAudioState();

  updateAudioSettings({
    effects: {
      hueShift: { enabled: true, amount: 45 }
    }
  });

  assert.equal(audioState.effects.hueShift.enabled, true, 'hueShift should be enabled');
  assert.equal(audioState.effects.hueShift.amount, 45, 'hueShift amount should be 45');

  // Update only amount
  updateAudioSettings({
    effects: {
      hueShift: { amount: 60 }
    }
  });

  assert.equal(audioState.effects.hueShift.enabled, true, 'hueShift should remain enabled');
  assert.equal(audioState.effects.hueShift.amount, 60, 'hueShift amount should be updated to 60');
});

test('audio-state: updateAudioSettings can update multiple effects at once', () => {
  resetAudioState();

  updateAudioSettings({
    enabled: true,
    effects: {
      brightness: { enabled: true, intensity: 0.9 },
      horizontalMask: { enabled: true },
      hueShift: { enabled: true, amount: 20 }
    }
  });

  assert.equal(audioState.enabled, true, 'audio should be enabled');
  assert.equal(audioState.effects.brightness.enabled, true, 'brightness should be enabled');
  assert.equal(audioState.effects.brightness.intensity, 0.9, 'brightness intensity should be 0.9');
  assert.equal(audioState.effects.horizontalMask.enabled, true, 'horizontalMask should be enabled');
  assert.equal(audioState.effects.hueShift.enabled, true, 'hueShift should be enabled');
  assert.equal(audioState.effects.hueShift.amount, 20, 'hueShift amount should be 20');
});

test('audio-state: updateAudioSettings ignores invalid enabled type', () => {
  resetAudioState();

  audioState.enabled = true;
  updateAudioSettings({ enabled: 'invalid' });

  assert.equal(audioState.enabled, true, 'enabled should remain true with invalid type');
});

test('audio-state: updateAudioSettings handles missing effects gracefully', () => {
  resetAudioState();

  // Should not throw when effects object is missing
  updateAudioSettings({ enabled: false });
  assert.equal(audioState.enabled, false, 'enabled should be updated');

  // Should not throw when individual effects are missing
  updateAudioSettings({ effects: {} });

  // Ensure defaults remain
  assert.equal(audioState.effects.brightness.enabled, false, 'brightness should remain default');
  assert.equal(audioState.effects.horizontalMask.enabled, false, 'horizontalMask should remain default');
  assert.equal(audioState.effects.hueShift.enabled, false, 'hueShift should remain default');
});
