import { rgbToHex, hexToRgb } from './utils.mjs';

export function colorStopsWidget(key, schema, values, send){
  const label = document.createElement('label');
  label.textContent = schema.label || key;
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '4px';
  label.appendChild(container);

  const stops = values[key] || [];
  values[key] = stops;

  function emit(){
    send({ [key]: stops });
  }

  function render(){
    container.innerHTML = '';
    stops.forEach((stop,i)=>{
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '4px';

      const pos = document.createElement('input');
      pos.type = 'number'; pos.min = 0; pos.max = 1; pos.step = 0.01;
      pos.value = stop.pos ?? 0;
      pos.oninput = () => { stop.pos = parseFloat(pos.value); emit(); };

      const col = document.createElement('input');
      col.type = 'color';
      col.value = rgbToHex(stop.color || [1,1,1]);
      col.oninput = () => { stop.color = hexToRgb(col.value); emit(); };

      const del = document.createElement('button');
      del.type = 'button'; del.textContent = 'x';
      del.onclick = () => { stops.splice(i,1); emit(); render(); };

      row.append(pos, col, del);
      container.appendChild(row);
    });
    const add = document.createElement('button');
    add.type = 'button'; add.textContent = 'Add';
    add.onclick = () => { stops.push({ pos: 0, color: [1,1,1] }); emit(); render(); };
    container.appendChild(add);
  }

  render();
  return label;
}
