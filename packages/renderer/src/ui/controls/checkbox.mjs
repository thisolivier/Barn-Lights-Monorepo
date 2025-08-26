export function checkboxWidget(key, schema, values, send){
  const label = document.createElement('label');
  label.textContent = schema.label || key;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.key = key;
  input.checked = !!values[key];
  input.oninput = () => {
    const v = input.checked;
    values[key] = v;
    send({ [key]: v });
  };
  label.appendChild(input);
  return label;
}
