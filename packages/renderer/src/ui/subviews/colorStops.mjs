import { rgbToHex, hexToRgb } from './utils.mjs';

export function colorStopsWidget(key, schema, values, send){
  const label = document.createElement('label');
  label.textContent = schema.label || key;
  const container = document.createElement('div');
  container.style.width = '250px';
  container.style.paddingTop = '20px';
  container.style.paddingBottom = '5px';
  label.appendChild(container);

  const stops = values[key] || [];
  values[key] = stops;

  const gp = new window.Grapick({ el: container, direction: 'to right' });
  stops.forEach(s => gp.addHandler((s.pos ?? 0) * 100, rgbToHex(s.color || [1,1,1])));

  function sync(){
    const handlers = gp.getHandlers().slice().sort((a,b)=>a.position-b.position);
    stops.length = 0;
    handlers.forEach(h => {
      stops.push({ pos: h.position / 100, color: hexToRgb(h.color) });
    });
    send({ [key]: stops });
  }

  // Listen to handler events as Grapick's aggregated change event
  // is not always fired on color updates.
  const updateStops = () => sync();
  gp.on('handler:color:change', updateStops);
  gp.on('handler:position:change', updateStops);
  gp.on('handler:add', updateStops);
  gp.on('handler:remove', updateStops);
  return label;
}
