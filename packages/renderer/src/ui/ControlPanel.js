import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParamsContext } from './ParamsContext.js';
import { effects } from '../effects/index.mjs';
import { fetchPresetNames } from './presets.mjs';
import EffectControls, { SpeedSlider } from './subviews/index.js';
import { requestReboot } from './reboot.mjs';

export default function ControlPanel() {
  const { params, dispatch, sendPatch } = useParamsContext();
  const [presetNames, setPresetNames] = useState([]);
  const [presetInput, setPresetInput] = useState('');

  // Persistence state for settings that should override WebSocket updates
  const [persisted, setPersisted] = useState({
    brightness: null,
    gamma: null,
    fpsCap: null,
    renderMode: null,
  });

  // Refs for checking if inputs are focused (to avoid fighting with user typing)
  const pitchDegRef = useRef(null);
  const yawDegRef = useRef(null);

  // Angle display state (updated via requestAnimationFrame)
  const [pitchDeg, setPitchDeg] = useState(0);
  const [yawDeg, setYawDeg] = useState(0);

  const activeEffectId = params.effect || 'gradient';
  const activeEffect = effects[activeEffectId] || effects.gradient;
  const effectParams = (params.effects && params.effects[activeEffectId]) || {};

  // Load preset names on mount
  useEffect(() => {
    fetchPresetNames(window).then(setPresetNames).catch(() => {});
  }, []);

  // Persistence override effect: when params change from WebSocket,
  // re-apply persisted values if they differ
  useEffect(() => {
    if (persisted.brightness !== null && params.post?.brightness !== persisted.brightness) {
      sendPatch({ brightness: persisted.brightness });
    }
    if (persisted.gamma !== null && params.post?.gamma !== persisted.gamma) {
      sendPatch({ gamma: persisted.gamma });
    }
    if (persisted.fpsCap !== null && params.fpsCap !== persisted.fpsCap) {
      sendPatch({ fpsCap: persisted.fpsCap });
    }
    if (persisted.renderMode !== null && params.renderMode !== persisted.renderMode) {
      sendPatch({ renderMode: persisted.renderMode });
    }
  }, [params.post?.brightness, params.post?.gamma, params.fpsCap, params.renderMode, persisted, sendPatch]);

  // Update angle displays with requestAnimationFrame
  useEffect(() => {
    let rafId;
    const updateAngles = () => {
      if (pitchDegRef.current && document.activeElement !== pitchDegRef.current) {
        setPitchDeg(Math.abs(params.post?.pitch || 0).toFixed(1));
      }
      if (yawDegRef.current && document.activeElement !== yawDegRef.current) {
        setYawDeg(Math.abs(params.post?.yaw || 0).toFixed(1));
      }
      rafId = requestAnimationFrame(updateAngles);
    };
    updateAngles();
    return () => cancelAnimationFrame(rafId);
  }, [params.post?.pitch, params.post?.yaw]);

  const handlePresetSelect = async (name) => {
    await fetch(`/preset/load/${encodeURIComponent(name)}`);
    setPresetInput(name);
  };

  // Save preset with canvas capture for thumbnail
  const handlePresetSave = async () => {
    const name = presetInput.trim();
    if (!name) return;

    const left = document.getElementById('left');
    const right = document.getElementById('right');

    if (left && right) {
      // Create composite thumbnail from both canvases
      const size = Math.min(left.width, left.height);
      const offscreen = document.createElement('canvas');
      offscreen.width = size * 2;
      offscreen.height = size;
      const ctx = offscreen.getContext('2d');
      ctx.drawImage(left, 0, 0, left.width, left.height, 0, 0, size, size);
      ctx.drawImage(right, 0, 0, right.width, right.height, size, 0, size, size);

      const blob = await new Promise((resolve) => offscreen.toBlob(resolve, 'image/png'));
      await fetch(`/preset/save/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: blob,
        headers: { 'Content-Type': 'image/png' },
      });
    } else {
      // No canvases found, save without thumbnail
      await fetch(`/preset/save/${encodeURIComponent(name)}`, { method: 'POST' });
    }

    fetchPresetNames(window).then(setPresetNames).catch(() => {});
  };

  const handlePresetDelete = async (name, event) => {
    event.stopPropagation(); // Prevent triggering preset load

    if (!window.confirm(`Delete preset '${name}'? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/preset/delete/${encodeURIComponent(name)}`, {
        method: 'POST'
      });

      if (response.ok) {
        if (presetInput === name) {
          setPresetInput('');
        }
        fetchPresetNames(window).then(setPresetNames).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to delete preset:', err);
    }
  };

  const setPostParam = useCallback((key, value) => {
    dispatch({ post: { [key]: value } }, false);
    sendPatch({ [key]: value });
    // Update persisted value if persistence is enabled for this key
    if (key === 'brightness' && persisted.brightness !== null) {
      setPersisted((prev) => ({ ...prev, brightness: value }));
    }
    if (key === 'gamma' && persisted.gamma !== null) {
      setPersisted((prev) => ({ ...prev, gamma: value }));
    }
  }, [dispatch, sendPatch, persisted.brightness, persisted.gamma]);

  const setTopLevelParam = useCallback((key, value) => {
    dispatch({ [key]: value }, false);
    sendPatch({ [key]: value });
    // Update persisted value if persistence is enabled for this key
    if (key === 'fpsCap' && persisted.fpsCap !== null) {
      setPersisted((prev) => ({ ...prev, fpsCap: value }));
    }
    if (key === 'renderMode' && persisted.renderMode !== null) {
      setPersisted((prev) => ({ ...prev, renderMode: value }));
    }
  }, [dispatch, sendPatch, persisted.fpsCap, persisted.renderMode]);

  const setEffectParam = (key, value) => {
    dispatch({ effects: { [activeEffectId]: { [key]: value } } }, false);
    sendPatch({ [key]: value });
  };

  const handleTintChange = (index, value) => {
    const tintArray = params.post?.tint ? [...params.post.tint] : [1, 1, 1];
    tintArray[index] = value;
    setPostParam('tint', tintArray);
  };

  // Persistence toggle handlers
  const togglePersistBrightness = (checked) => {
    setPersisted((prev) => ({
      ...prev,
      brightness: checked ? (params.post?.brightness ?? 1) : null,
    }));
  };

  const togglePersistGamma = (checked) => {
    setPersisted((prev) => ({
      ...prev,
      gamma: checked ? (params.post?.gamma ?? 1) : null,
    }));
  };

  const togglePersistFpsCap = (checked) => {
    setPersisted((prev) => ({
      ...prev,
      fpsCap: checked ? (params.fpsCap ?? 60) : null,
    }));
  };

  const togglePersistRenderMode = (checked) => {
    setPersisted((prev) => ({
      ...prev,
      renderMode: checked ? (params.renderMode || 'duplicate') : null,
    }));
  };

  // Pitch/yaw degree input handlers - set angle and reset speed
  const handlePitchDegChange = (e) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) {
      dispatch({ post: { pitch: v, pitchSpeed: 0 } }, false);
      sendPatch({ pitch: v, pitchSpeed: 0 });
    }
  };

  const handleYawDegChange = (e) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) {
      dispatch({ post: { yaw: v, yawSpeed: 0 } }, false);
      sendPatch({ yaw: v, yawSpeed: 0 });
    }
  };

  return (
    <div className="panel">
      <fieldset>
        <legend>Presets</legend>
        <div className="row">
          <div className="presetRow">
            {presetNames.map((name) => (
              <div key={name} className="presetItem" onClick={() => handlePresetSelect(name)}>
                <img src={`/preset/preview/${encodeURIComponent(name)}`} alt={name} />
                <div className="presetName">{name}</div>
                <button
                  className="deleteBtn"
                  onClick={(e) => handlePresetDelete(name, e)}
                  aria-label={`Delete ${name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input value={presetInput} onChange={(e) => setPresetInput(e.target.value)} placeholder="name" />
            <button onClick={handlePresetSave}>Save</button>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Effect</legend>
        <div className="row">
          <label>
            Effect
            <select value={activeEffectId} onChange={(e) => dispatch({ effect: e.target.value })}>
              {Object.values(effects).map((eff) => (
                <option key={eff.id} value={eff.id}>{eff.displayName}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <EffectControls schema={activeEffect.paramSchema} values={effectParams} onChange={setEffectParam} />
        </div>
      </fieldset>

      <fieldset>
        <legend>General</legend>
        <div className="row">
          <label>
            Brightness
            <input type="range" min="0" max="1" step="0.01" value={params.post?.brightness ?? 0} onChange={(e) => setPostParam('brightness', parseFloat(e.target.value))} />
            <span>{params.post?.brightness ?? 0}</span>
            <input type="checkbox" checked={persisted.brightness !== null} onChange={(e) => togglePersistBrightness(e.target.checked)} title="Persist brightness" />
          </label>
          <label>
            Gamma
            <input type="range" min="0.5" max="3" step="0.01" value={params.post?.gamma ?? 1} onChange={(e) => setPostParam('gamma', parseFloat(e.target.value))} />
            <span>{params.post?.gamma ?? 1}</span>
            <input type="checkbox" checked={persisted.gamma !== null} onChange={(e) => togglePersistGamma(e.target.checked)} title="Persist gamma" />
            <small className="desc">brightness curve</small>
          </label>
          <label>
            FPS cap
            <input type="range" min="1" max="60" step="1" value={params.fpsCap ?? 60} onChange={(e) => setTopLevelParam('fpsCap', parseInt(e.target.value, 10))} />
            <span>{params.fpsCap ?? 60}</span>
            <input type="checkbox" checked={persisted.fpsCap !== null} onChange={(e) => togglePersistFpsCap(e.target.checked)} title="Persist FPS cap" />
          </label>
          <label>
            Render mode
            <select value={params.renderMode || 'duplicate'} onChange={(e) => setTopLevelParam('renderMode', e.target.value)}>
              <option value="duplicate">duplicate</option>
              <option value="extended">extended</option>
              <option value="mirror">mirror</option>
            </select>
            <input type="checkbox" checked={persisted.renderMode !== null} onChange={(e) => togglePersistRenderMode(e.target.checked)} title="Persist render mode" />
          </label>
        </div>
        <div className="row">
          <button onClick={() => requestReboot('left')}>Reboot Left</button>
          <button onClick={() => requestReboot('right')}>Reboot Right</button>
          <a href="#/calibration" className="calibration-link">Calibration Mode</a>
        </div>
      </fieldset>

      <fieldset>
        <legend>Orientation</legend>
        <div className="row">
          <label>
            Pitch
            <SpeedSlider value={params.post?.pitchSpeed ?? 0} max={500} onChange={(v) => setPostParam('pitchSpeed', v)} />
            <input
              ref={pitchDegRef}
              type="number"
              min="0"
              max="360"
              step="0.1"
              value={pitchDeg}
              onChange={(e) => setPitchDeg(e.target.value)}
              onBlur={handlePitchDegChange}
              onKeyDown={(e) => e.key === 'Enter' && handlePitchDegChange(e)}
              style={{ width: '60px' }}
            />
          </label>
          <label>
            Yaw
            <SpeedSlider value={params.post?.yawSpeed ?? 0} max={Math.PI} onChange={(v) => setPostParam('yawSpeed', v)} />
            <input
              ref={yawDegRef}
              type="number"
              min="0"
              max="360"
              step="0.1"
              value={yawDeg}
              onChange={(e) => setYawDeg(e.target.value)}
              onBlur={handleYawDegChange}
              onKeyDown={(e) => e.key === 'Enter' && handleYawDegChange(e)}
              style={{ width: '60px' }}
            />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Strobe</legend>
        <div className="row">
          <label>
            Strobe Hz
            <input type="range" min="0" max="20" step="0.1" value={params.post?.strobeHz ?? 0} onChange={(e) => setPostParam('strobeHz', parseFloat(e.target.value))} />
            <span>{params.post?.strobeHz ?? 0}</span>
          </label>
          <label>
            Duty
            <input type="range" min="0" max="1" step="0.01" value={params.post?.strobeDuty ?? 0} onChange={(e) => setPostParam('strobeDuty', parseFloat(e.target.value))} />
            <span>{params.post?.strobeDuty ?? 0}</span>
            <small className="desc">on-time %</small>
          </label>
          <label>
            Low
            <input type="range" min="0" max="1" step="0.01" value={params.post?.strobeLow ?? 0} onChange={(e) => setPostParam('strobeLow', parseFloat(e.target.value))} />
            <span>{params.post?.strobeLow ?? 0}</span>
            <small className="desc">min brightness</small>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Tint</legend>
        <div className="row">
          <label>
            Tint R
            <input type="range" min="0" max="1" step="0.01" value={params.post?.tint ? params.post.tint[0] : 1} onChange={(e) => handleTintChange(0, parseFloat(e.target.value))} />
            <span>{params.post?.tint ? params.post.tint[0] : 1}</span>
          </label>
          <label>
            Tint G
            <input type="range" min="0" max="1" step="0.01" value={params.post?.tint ? params.post.tint[1] : 1} onChange={(e) => handleTintChange(1, parseFloat(e.target.value))} />
            <span>{params.post?.tint ? params.post.tint[1] : 1}</span>
          </label>
          <label>
            Tint B
            <input type="range" min="0" max="1" step="0.01" value={params.post?.tint ? params.post.tint[2] : 1} onChange={(e) => handleTintChange(2, parseFloat(e.target.value))} />
            <span>{params.post?.tint ? params.post.tint[2] : 1}</span>
          </label>
        </div>
      </fieldset>
    </div>
  );
}
