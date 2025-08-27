const mix = (a,b,t)=> a + (b-a)*t;
const mix3 = (A,B,t)=> [mix(A[0],B[0],t), mix(A[1],B[1],t), mix(A[2],B[2],t)];

export const id = 'gradient';
export const displayName = 'Gradient';
export const defaultParams = {
  stops: [
    { pos: 0, color: [0.0, 0.0, 1.0] },
    { pos: 1, color: [1.0, 0.0, 0.0] },
  ],
  gradPhase: 0.0,
  reverse: false,
};
export const paramSchema = {
  stops: { type: 'colorStops', label: 'Stops' },
  gradPhase: { type: 'number', min: 0, max: 1, step: 0.001 },
  reverse: { type: 'button', label: 'Reverse' },
};

function sampleGradient(stops, u){
  const sorted = stops.slice().sort((a,b)=> (a.pos ?? 0) - (b.pos ?? 0));
  let i = 1;
  while (i < sorted.length && u >= sorted[i].pos) i++;
  const left = sorted[i-1];
  const right = sorted[i] || { pos: sorted[0].pos + 1, color: sorted[0].color };
  const span = right.pos - left.pos;
  const t = span > 0 ? (u - left.pos) / span : 0;
  return mix3(left.color, right.color, t);
}

export function render(sceneF32, W, H, t, params){
  const { stops = [], gradPhase = 0, reverse = false } = params;
  if (stops.length < 2) return;
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const base = (x / W + gradPhase) % 1;
      const u = reverse ? (1 - base) : base;
      const rgb = sampleGradient(stops, u);
      const i=(y*W+x)*3;
      sceneF32[i]=rgb[0]; sceneF32[i+1]=rgb[1]; sceneF32[i+2]=rgb[2];
    }
  }
}
