// Shared audio state module
// Updated by WebSocket messages from the audio package
// Read by post-processing effects

export const audioState = {
  rms: 0,
  bass: 0,
  mids: 0,
  highs: 0,
  beat: false,
  lastBeatTime: 0,
  enabled: true,
  // Effect settings
  effects: {
    brightness: { enabled: false, intensity: 1.0 },
    horizontalMask: { enabled: false },
    hueShift: { enabled: false, amount: 30 }
  }
};

// Update audio state from incoming WebSocket data
export function updateAudioState(data) {
  if (typeof data.rms === 'number') audioState.rms = data.rms;
  if (typeof data.bass === 'number') audioState.bass = data.bass;
  if (typeof data.mids === 'number') audioState.mids = data.mids;
  if (typeof data.highs === 'number') audioState.highs = data.highs;
  if (typeof data.beat === 'boolean') {
    audioState.beat = data.beat;
    if (data.beat) {
      audioState.lastBeatTime = Date.now();
    }
  }
}

// Update audio effect settings from incoming WebSocket data
export function updateAudioSettings(settings) {
  if (typeof settings.enabled === 'boolean') {
    audioState.enabled = settings.enabled;
  }
  if (settings.effects) {
    if (settings.effects.brightness) {
      Object.assign(audioState.effects.brightness, settings.effects.brightness);
    }
    if (settings.effects.horizontalMask) {
      Object.assign(audioState.effects.horizontalMask, settings.effects.horizontalMask);
    }
    if (settings.effects.hueShift) {
      Object.assign(audioState.effects.hueShift, settings.effects.hueShift);
    }
  }
}
