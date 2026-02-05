import React, { useState, useEffect, useCallback } from 'react';
import { useParamsContext } from './ParamsContext.js';
import CanvasPreview from './CanvasPreview.js';
import EffectControls from './subviews/index.js';
import { effects } from '../effects/index.mjs';

const CALIBRATION_EFFECTS = ['lineScanner', 'sectionHighlighter'];

export default function CalibrationPage({
  layouts,
  setLayouts,
  scene,
  runtime,
  sendWsMessage
}) {
  const { params, dispatch, sendPatch } = useParamsContext();
  const [selectedSide, setSelectedSide] = useState('left');
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [editingValues, setEditingValues] = useState({ x0: 0, x1: 0, y: 0 });
  const [editingLedCounts, setEditingLedCounts] = useState({});

  // Get sections for the selected side
  const getSections = useCallback(() => {
    const layout = selectedSide === 'left' ? layouts.left : layouts.right;
    if (!layout?.runs) return [];
    const sections = [];
    for (const run of layout.runs) {
      for (const section of run.sections) {
        sections.push({ ...section, runIndex: run.run_index });
      }
    }
    return sections;
  }, [selectedSide, layouts]);

  const sections = getSections();

  // Find the run containing the selected section
  const getSelectedRun = useCallback(() => {
    const layout = selectedSide === 'left' ? layouts.left : layouts.right;
    if (!layout?.runs || !selectedSectionId) return null;
    for (const run of layout.runs) {
      if (run.sections.some(sec => sec.id === selectedSectionId)) {
        return run;
      }
    }
    return null;
  }, [selectedSide, selectedSectionId, layouts]);

  const selectedRun = getSelectedRun();

  // Auto-select first section when side changes
  useEffect(() => {
    if (sections.length > 0 && !selectedSectionId) {
      setSelectedSectionId(sections[0].id);
    }
  }, [sections, selectedSectionId]);

  // Update editing values when selection changes
  useEffect(() => {
    if (selectedSectionId) {
      const section = sections.find(sec => sec.id === selectedSectionId);
      if (section) {
        setEditingValues({
          x0: section.x0,
          x1: section.x1,
          y: section.y
        });
      }
    }
  }, [selectedSectionId, sections]);

  // Sync LED counts when selected run changes
  useEffect(() => {
    if (selectedRun) {
      const counts = {};
      for (const section of selectedRun.sections) {
        counts[section.id] = section.led_count;
      }
      setEditingLedCounts(counts);
    }
  }, [selectedRun]);

  // LED distribution validation
  const ledCountTotal = Object.values(editingLedCounts).reduce((sum, count) => sum + count, 0);
  const ledCountExpected = selectedRun ? selectedRun.led_count : 0;
  const ledCountDelta = ledCountTotal - ledCountExpected;
  const ledCountValid = ledCountDelta === 0;

  // Switch to a calibration effect on mount
  useEffect(() => {
    if (!CALIBRATION_EFFECTS.includes(params.effect)) {
      dispatch({ effect: 'lineScanner' });
      sendPatch({ effect: 'lineScanner' });
    }
  }, []);

  // Update section highlighter params when selection changes
  useEffect(() => {
    if (params.effect === 'sectionHighlighter') {
      const sectionIndex = sections.findIndex(sec => sec.id === selectedSectionId);
      if (sectionIndex >= 0) {
        const section = sections[sectionIndex];
        const layout = selectedSide === 'left' ? layouts.left : layouts.right;
        const samplingWidth = layout?.sampling?.width || 7.0;
        const samplingHeight = layout?.sampling?.height || 1.0;

        const highlighterParams = {
          side: selectedSide,
          sectionIndex,
          sectionX0: section.x0,
          sectionX1: section.x1,
          sectionY: section.y,
          samplingWidth,
          samplingHeight
        };

        dispatch({ effects: { sectionHighlighter: highlighterParams } }, false);
        sendPatch(highlighterParams);
      }
    }
  }, [selectedSide, selectedSectionId, params.effect, sections, layouts, dispatch, sendPatch]);

  const handleEffectChange = (event) => {
    const effect = event.target.value;
    dispatch({ effect });
    sendPatch({ effect });
  };

  const handleSideChange = (event) => {
    setSelectedSide(event.target.value);
    setSelectedSectionId(null);
  };

  const handleSectionSelect = (sectionId) => {
    setSelectedSectionId(sectionId);
  };

  const handleValueChange = (field, value) => {
    setEditingValues(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  const handleSave = () => {
    if (!selectedSectionId) return;

    sendWsMessage({
      type: 'updateSection',
      side: selectedSide,
      sectionId: selectedSectionId,
      x0: editingValues.x0,
      x1: editingValues.x1,
      y: editingValues.y
    });
  };

  const handleLedCountChange = (sectionId, value) => {
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      setEditingLedCounts(prev => ({ ...prev, [sectionId]: parsed }));
    }
  };

  const handleSaveLedCounts = () => {
    if (!ledCountValid || !selectedRun) return;
    for (const section of selectedRun.sections) {
      if (editingLedCounts[section.id] !== section.led_count) {
        sendWsMessage({
          type: 'updateSection',
          side: selectedSide,
          sectionId: section.id,
          led_count: editingLedCounts[section.id]
        });
      }
    }
  };

  // Force to a calibration effect - params.effect may still be 'gradient' on first render
  const rawEffectId = params.effect || 'lineScanner';
  const activeEffectId = CALIBRATION_EFFECTS.includes(rawEffectId) ? rawEffectId : 'lineScanner';
  const activeEffect = effects[activeEffectId];
  const effectParams = (params.effects && params.effects[activeEffectId]) || {};

  const setEffectParam = (key, value) => {
    dispatch({ effects: { [activeEffectId]: { [key]: value } } }, false);
    sendPatch({ [key]: value });
  };

  return React.createElement('div', { className: 'calibration-page' },
    runtime && layouts.left && layouts.right && scene.width && scene.height &&
      React.createElement(CanvasPreview, {
        getParams: runtime.getParams,
        layoutLeft: layouts.left,
        layoutRight: layouts.right,
        sceneWidth: scene.width,
        sceneHeight: scene.height,
        shouldAnimate: true
      }),

    React.createElement('div', { className: 'calibration-controls' },
      React.createElement('fieldset', null,
        React.createElement('legend', null, 'Effect'),
        React.createElement('select', {
          value: activeEffectId,
          onChange: handleEffectChange
        },
          CALIBRATION_EFFECTS.map(effectId =>
            React.createElement('option', { key: effectId, value: effectId },
              effectId === 'lineScanner' ? 'Line Scanner' : 'Section Highlighter'
            )
          )
        )
      ),

      React.createElement('fieldset', null,
        React.createElement('legend', null, 'Effect Parameters'),
        React.createElement('div', { className: 'row' },
          React.createElement(EffectControls, {
            schema: activeEffect.paramSchema,
            values: effectParams,
            onChange: setEffectParam
          })
        )
      ),

      React.createElement('fieldset', null,
        React.createElement('legend', null, 'Side'),
        React.createElement('select', {
          value: selectedSide,
          onChange: handleSideChange
        },
          React.createElement('option', { value: 'left' }, 'Left'),
          React.createElement('option', { value: 'right' }, 'Right')
        )
      ),

      React.createElement('fieldset', null,
        React.createElement('legend', null, 'Sections'),
        React.createElement('div', { className: 'section-list' },
          sections.map(section =>
            React.createElement('div', {
              key: section.id,
              className: `section-item ${section.id === selectedSectionId ? 'selected' : ''}`,
              onClick: () => handleSectionSelect(section.id)
            },
              React.createElement('strong', null, section.id),
              React.createElement('span', null, ` (${section.led_count} LEDs)`)
            )
          )
        )
      ),

      selectedSectionId && React.createElement('fieldset', null,
        React.createElement('legend', null, `Edit Section: ${selectedSectionId}`),
        React.createElement('div', { className: 'position-editors' },
          React.createElement('label', null,
            'X0',
            React.createElement('input', {
              type: 'number',
              step: '0.05',
              value: editingValues.x0,
              onChange: (event) => handleValueChange('x0', event.target.value)
            })
          ),
          React.createElement('label', null,
            'X1',
            React.createElement('input', {
              type: 'number',
              step: '0.05',
              value: editingValues.x1,
              onChange: (event) => handleValueChange('x1', event.target.value)
            })
          ),
          React.createElement('label', null,
            'Y',
            React.createElement('input', {
              type: 'number',
              step: '0.05',
              min: '0',
              max: '1',
              value: editingValues.y,
              onChange: (event) => handleValueChange('y', event.target.value)
            })
          )
        ),
        React.createElement('button', {
          onClick: handleSave,
          className: 'save-btn'
        }, 'Save Position')
      ),

      selectedRun && React.createElement('fieldset', null,
        React.createElement('legend', null, `Distribution of LEDs (Run ${selectedRun.run_index})`),
        React.createElement('div', { className: 'led-distribution' },
          selectedRun.sections.map(section =>
            React.createElement('label', { key: section.id },
              section.id,
              React.createElement('input', {
                type: 'number',
                min: '0',
                step: '1',
                value: editingLedCounts[section.id] ?? '',
                onChange: (event) => handleLedCountChange(section.id, event.target.value)
              })
            )
          ),
          React.createElement('div', { className: 'led-total' },
            `Total: ${ledCountTotal} / ${ledCountExpected}`
          ),
          !ledCountValid && React.createElement('div', { className: 'led-error' },
            ledCountDelta > 0
              ? `${ledCountDelta} extra LED(s) \u2014 remove ${ledCountDelta} to match run total`
              : `${Math.abs(ledCountDelta)} missing LED(s) \u2014 add ${Math.abs(ledCountDelta)} to match run total`
          ),
          React.createElement('button', {
            className: 'save-btn',
            onClick: handleSaveLedCounts,
            disabled: !ledCountValid
          }, 'Save LED Counts')
        )
      )
    ),

    React.createElement('style', null, `
      .calibration-page {
        padding: 16px;
      }
      .calibration-controls {
        display: flex;
        flex-wrap: wrap;
        flex-direction: row;
        justify-content: center;
        gap: 12px;
      }
      .calibration-controls fieldset {
        margin: 0;
        padding: 12px;
      }
      .calibration-controls select,
      .calibration-controls input {
        padding: 4px 8px;
        margin-left: 8px;
      }
      .section-list {
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid #444;
        border-radius: 4px;
      }
      .section-item {
        padding: 8px 12px;
        cursor: pointer;
        border-bottom: 1px solid #333;
      }
      .section-item:hover {
        background: #333;
      }
      .section-item.selected {
        background: #445;
        border-left: 3px solid #88f;
      }
      .position-editors {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .position-editors label {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .position-editors input {
        width: 100px;
      }
      .save-btn {
        margin-top: 12px;
        padding: 8px 24px;
        background: #4a4;
        border: none;
        color: white;
        cursor: pointer;
        border-radius: 4px;
      }
      .save-btn:hover {
        background: #5b5;
      }
      .led-distribution {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .led-distribution label {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .led-total,
      .led-error,
      .led-distribution .save-btn {
        flex-basis: 100%;
      }
      .led-distribution input {
        width: 80px;
      }
      .led-total {
        font-weight: bold;
        padding-top: 4px;
        border-top: 1px solid #444;
      }
      .led-error {
        color: #e44;
        font-size: 13px;
      }
      .save-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `)
  );
}
