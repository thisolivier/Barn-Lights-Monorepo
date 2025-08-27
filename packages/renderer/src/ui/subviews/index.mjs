import { numberWidget } from './number.mjs';
import { checkboxWidget } from './checkbox.mjs';
import { enumWidget } from './enum.mjs';
import { colorWidget } from './color.mjs';
import { colorStopsWidget } from './colorStops.mjs';
import { buttonWidget } from './button.mjs';

const widgets = {
  number: numberWidget,
  float: numberWidget,
  checkbox: checkboxWidget,
  enum: enumWidget,
  color: colorWidget,
  rgb: colorWidget,
  colorStops: colorStopsWidget,
  button: buttonWidget,
};

export function renderControls(schema, values, send){
  const frag = document.createDocumentFragment();
  if (!schema) return frag;
  for (const [key, desc] of Object.entries(schema)){
    const type = desc.type || 'number';
    const widget = widgets[type];
    if (!widget) continue;
    const el = widget(key, desc, values, send);
    if (el) frag.appendChild(el);
  }
  return frag;
}
