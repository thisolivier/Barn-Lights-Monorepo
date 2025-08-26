export function enumWidget(key, schema, values, send){
  const label = document.createElement('label');
  label.textContent = schema.label || key;
  const select = document.createElement('select');
  select.dataset.key = key;
  (schema.values || []).forEach(opt => {
    const o = document.createElement('option');
    if (typeof opt === 'string') {
      o.value = opt;
      o.textContent = opt;
    } else {
      o.value = opt.value;
      o.textContent = opt.label || opt.value;
    }
    select.appendChild(o);
  });
  select.value = values[key];
  select.onchange = () => {
    const v = select.value;
    values[key] = v;
    send({ [key]: v });
  };
  label.appendChild(select);
  return label;
}
