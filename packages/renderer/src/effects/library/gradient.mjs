const mix = (a,b,t)=> a + (b-a)*t;
const mix3 = (A,B,t)=> [mix(A[0],B[0],t), mix(A[1],B[1],t), mix(A[2],B[2],t)];

export const id = 'gradient';
export const displayName = 'Gradient';
export const defaultParams = {
  gradStart: [0.0, 0.0, 1.0],
  gradEnd:   [1.0, 0.0, 0.0],
  gradPhase: 0.0,
};
export const paramSchema = {
  gradStart: { type: 'rgb' },
  gradEnd:   { type: 'rgb' },
  gradPhase: { type: 'float' },
};

export function render(sceneF32, W, H, t, params){
  const { gradStart, gradEnd, gradPhase=0 } = params;
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const u = (x/W + gradPhase) % 1;
      const rgb = mix3(gradStart, gradEnd, u);
      const i=(y*W+x)*3;
      sceneF32[i]=rgb[0]; sceneF32[i+1]=rgb[1]; sceneF32[i+2]=rgb[2];
    }
  }
}
