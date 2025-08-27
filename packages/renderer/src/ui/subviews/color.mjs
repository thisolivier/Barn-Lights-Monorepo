import { rgbToHex, hexToRgb } from './utils.mjs';

export function colorWidget(key, schema, values, send){
  const label = document.createElement('label');
  label.textContent = schema.label || key;
  const input = document.createElement('input');
  input.type = 'color';
  input.dataset.key = key;
  const current = values[key] || schema.default || [1,1,1];
  input.value = Array.isArray(current) ? rgbToHex(current) : current;
  input.oninput = () => {
    const rgb = hexToRgb(input.value);
    values[key] = rgb;
    send({ [key]: rgb });
  };
  label.appendChild(input);
  return label;
}
