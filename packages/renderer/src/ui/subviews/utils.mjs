export function rgbToHex(rgb){
  const [r,g,b] = rgb.map(v => Math.max(0, Math.min(255, Math.round(v*255))));
  return '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('');
}

export function hexToRgb(hex){
  const h = hex.replace('#','');
  return [
    parseInt(h.slice(0,2),16)/255,
    parseInt(h.slice(2,4),16)/255,
    parseInt(h.slice(4,6),16)/255,
  ];
}
