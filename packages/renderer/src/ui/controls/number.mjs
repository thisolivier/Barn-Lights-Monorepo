export function numberWidget(key, schema, values, send){
  const label = document.createElement('label');
  label.textContent = schema.label || key;
  const input = document.createElement('input');
  input.dataset.key = key;
  if (schema.min !== undefined && schema.max !== undefined){
    input.type = 'range';
    input.min = schema.min;
    input.max = schema.max;
    input.step = schema.step ?? 0.01;
  } else {
    input.type = 'number';
    if (schema.min !== undefined) input.min = schema.min;
    if (schema.max !== undefined) input.max = schema.max;
    if (schema.step !== undefined) input.step = schema.step;
  }
  const span = document.createElement('span');
  const setVal = v => { input.value = v; span.textContent = v; };
  setVal(values[key] ?? schema.default ?? 0);
  input.oninput = () => {
    const v = parseFloat(input.value);
    values[key] = v;
    span.textContent = v;
    send({ [key]: v });
  };
  label.appendChild(input);
  label.appendChild(span);
  return label;
}
