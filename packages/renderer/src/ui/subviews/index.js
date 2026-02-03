import React, { useEffect, useRef } from 'react';
import { rgbToHex, hexToRgb } from './utils.mjs';
export { default as SpeedSlider } from './SpeedSlider.js';

function NumberControl({ label, schema, value, onChange }) {
  const isRange = schema.min !== undefined && schema.max !== undefined;
  const inputProps = {
    value: value ?? schema.default ?? 0,
    onChange: (e) => onChange(parseFloat(e.target.value)),
  };
  if (isRange) {
    inputProps.type = 'range';
    inputProps.min = schema.min;
    inputProps.max = schema.max;
    inputProps.step = schema.step ?? 0.01;
  } else {
    inputProps.type = 'number';
    if (schema.min !== undefined) inputProps.min = schema.min;
    if (schema.max !== undefined) inputProps.max = schema.max;
    if (schema.step !== undefined) inputProps.step = schema.step;
  }
  return (
    <label>
      {label}
      <input {...inputProps} />
      <span>{value ?? schema.default ?? 0}</span>
    </label>
  );
}

function CheckboxControl({ label, value, onChange }) {
  return (
    <label>
      {label}
      <input type="checkbox" checked={value ?? false} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function EnumControl({ label, schema, value, onChange }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {(schema.values || []).map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </label>
  );
}

function ColorControl({ label, value, onChange }) {
  const hexValue = rgbToHex(Array.isArray(value) ? value : [1,1,1]);
  return (
    <label>
      {label}
      <input type="color" value={hexValue} onChange={(e) => onChange(hexToRgb(e.target.value))} />
    </label>
  );
}

function ColorStopsControl({ label, value = [], onChange }) {
  const containerRef = useRef(null);
  const gradientPickerRef = useRef(null);
  const onChangeRef = useRef(onChange);

  // Keep onChangeRef always up to date to avoid stale closures
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || !window.Grapick) return;
    const gradientPicker = new window.Grapick({ el: containerRef.current, direction: 'to right' });
    gradientPicker.on('change', () => {
      const handlers = gradientPicker.getHandlers().slice().sort((a, b) => a.position - b.position);
      const stops = handlers.map((handler) => ({ pos: handler.position / 100, color: hexToRgb(handler.color) }));
      onChangeRef.current(stops);
    });
    gradientPickerRef.current = gradientPicker;
    return () => {
      gradientPicker.destroy();
      gradientPickerRef.current = null;
    };
  }, []);
  useEffect(() => {
    const gradientPicker = gradientPickerRef.current;
    if (!gradientPicker) return;
    gradientPicker.clear({ silent: 1 });
    value.forEach((stop) => {
      const position = (stop.pos ?? 0) * 100;
      const colorHex = rgbToHex(stop.color || [1,1,1]);
      gradientPicker.addHandler(position, colorHex, 0, { silent: 1 });
    });
    gradientPicker.change(1, { silent: 1 });
  }, [value]);
  return (
    <label>
      {label}
      <div ref={containerRef} style={{ width: '250px', paddingTop: '20px', paddingBottom: '5px' }}></div>
    </label>
  );
}

function ButtonControl({ label, onChange }) {
  return <button onClick={() => onChange(true)}>{label}</button>;
}

const widgetMap = {
  number: NumberControl,
  float: NumberControl,
  checkbox: CheckboxControl,
  enum: EnumControl,
  color: ColorControl,
  rgb: ColorControl,
  colorStops: ColorStopsControl,
  button: ButtonControl,
};

export default function EffectControls({ schema, values = {}, onChange }) {
  if (!schema) return null;
  return (
    <>
      {Object.entries(schema).map(([key, desc]) => {
        const Widget = widgetMap[desc.type || 'number'];
        if (!Widget) return null;
        const label = desc.label || key;
        const value = values[key] ?? desc.default;
        const handle = (val) => onChange(key, val);
        return <Widget key={key} label={label} schema={desc} value={value} onChange={handle} />;
      })}
    </>
  );
}

