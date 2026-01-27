import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocketContext } from './WebSocketContext.js';

// Audio meter bar component
function Meter({ label, value, color = '#4a9eff' }) {
  const percentage = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="audio-meter">
      <div className="audio-meter-label">{label}</div>
      <div className="audio-meter-bar">
        <div
          className="audio-meter-fill"
          style={{
            height: `${percentage}%`,
            backgroundColor: color
          }}
        />
      </div>
      <div className="audio-meter-value">{(value * 100).toFixed(0)}%</div>
    </div>
  );
}

// Beat indicator component
function BeatIndicator({ active }) {
  return (
    <div className={`beat-indicator ${active ? 'active' : ''}`}>
      <div className="beat-dot" />
      <div className="beat-label">Beat</div>
    </div>
  );
}

// Toggle switch with optional slider
function EffectToggle({ label, enabled, onToggle, showSlider, sliderValue, sliderMin, sliderMax, sliderStep, sliderLabel, onSliderChange }) {
  return (
    <div className="audio-effect-toggle">
      <label className="toggle-row">
        <span className="toggle-label">{label}</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </label>
      {showSlider && enabled && (
        <label className="slider-row">
          <span className="slider-label">{sliderLabel}</span>
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={sliderStep}
            value={sliderValue}
            onChange={(e) => onSliderChange(parseFloat(e.target.value))}
          />
          <span className="slider-value">{sliderValue}</span>
        </label>
      )}
    </div>
  );
}

export default function AudioPanel({ audioState, onAudioStateChange }) {
  const { send } = useWebSocketContext();

  // Local state for audio levels and effects (will be updated by WebSocket)
  const [audio, setAudio] = useState({
    rms: 0,
    bass: 0,
    mids: 0,
    highs: 0,
    beat: false,
    enabled: true,
    effects: {
      brightness: { enabled: false, intensity: 1.0 },
      horizontalMask: { enabled: false },
      hueShift: { enabled: false, amount: 30 }
    }
  });

  // Update local state when audioState prop changes
  useEffect(() => {
    if (audioState) {
      setAudio(audioState);
    }
  }, [audioState]);

  // Send settings update to server
  const sendSettings = useCallback((newEffects) => {
    send({
      type: 'audioSettings',
      settings: { effects: newEffects }
    });
  }, [send]);

  // Effect toggle handlers
  const handleBrightnessToggle = (enabled) => {
    const newEffects = {
      ...audio.effects,
      brightness: { ...audio.effects.brightness, enabled }
    };
    sendSettings(newEffects);
  };

  const handleBrightnessIntensity = (intensity) => {
    const newEffects = {
      ...audio.effects,
      brightness: { ...audio.effects.brightness, intensity }
    };
    sendSettings(newEffects);
  };

  const handleHorizontalMaskToggle = (enabled) => {
    const newEffects = {
      ...audio.effects,
      horizontalMask: { ...audio.effects.horizontalMask, enabled }
    };
    sendSettings(newEffects);
  };

  const handleHueShiftToggle = (enabled) => {
    const newEffects = {
      ...audio.effects,
      hueShift: { ...audio.effects.hueShift, enabled }
    };
    sendSettings(newEffects);
  };

  const handleHueShiftAmount = (amount) => {
    const newEffects = {
      ...audio.effects,
      hueShift: { ...audio.effects.hueShift, amount }
    };
    sendSettings(newEffects);
  };

  return (
    <fieldset className="audio-panel">
      <legend>Audio</legend>

      {/* Audio Meters */}
      <div className="audio-meters-section">
        <div className="audio-meters">
          <Meter label="Volume" value={audio.rms} color="#4a9eff" />
          <Meter label="Bass" value={audio.bass} color="#ff4a4a" />
          <Meter label="Mids" value={audio.mids} color="#4aff4a" />
          <Meter label="Highs" value={audio.highs} color="#ffff4a" />
        </div>
        <BeatIndicator active={audio.beat} />
      </div>

      {/* Effect Controls */}
      <div className="audio-effects-section">
        <div className="row">
          <EffectToggle
            label="Audio Brightness"
            enabled={audio.effects.brightness.enabled}
            onToggle={handleBrightnessToggle}
            showSlider={true}
            sliderValue={audio.effects.brightness.intensity}
            sliderMin={0}
            sliderMax={2}
            sliderStep={0.1}
            sliderLabel="Intensity"
            onSliderChange={handleBrightnessIntensity}
          />
        </div>
        <div className="row">
          <EffectToggle
            label="Horizontal Mask"
            enabled={audio.effects.horizontalMask.enabled}
            onToggle={handleHorizontalMaskToggle}
            showSlider={false}
          />
        </div>
        <div className="row">
          <EffectToggle
            label="Hue Shift on Beat"
            enabled={audio.effects.hueShift.enabled}
            onToggle={handleHueShiftToggle}
            showSlider={true}
            sliderValue={audio.effects.hueShift.amount}
            sliderMin={0}
            sliderMax={180}
            sliderStep={1}
            sliderLabel="Amount"
            onSliderChange={handleHueShiftAmount}
          />
        </div>
      </div>
    </fieldset>
  );
}
