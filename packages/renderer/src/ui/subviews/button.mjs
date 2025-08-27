export function buttonWidget(key, schema, values, send){
  const btn = document.createElement('button');
  btn.textContent = schema.label || key;
  btn.onclick = () => {
    const v = !values[key];
    values[key] = v;
    send({ [key]: v });
  };
  return btn;
}
