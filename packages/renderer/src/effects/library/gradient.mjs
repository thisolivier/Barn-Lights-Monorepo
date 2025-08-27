import { sortColorStops, sampleGradient } from './gradient-utils.mjs';

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

export function render(sceneF32, W, H, t, params){
  const { stops = [], gradPhase = 0, reverse = false } = params;
  if (stops.length < 2) return;
  const sortedStops = sortColorStops(stops);
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const u = (x/W + gradPhase) % 1;
      const rgb = sampleGradient(sortedStops, u);
      const index=(y*W+x)*3;
      sceneF32[index]=rgb[0]; sceneF32[index+1]=rgb[1]; sceneF32[index+2]=rgb[2];
    }
  }
}
