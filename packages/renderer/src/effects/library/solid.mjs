export const id = 'solid';
export const displayName = 'Solid';
export const defaultParams = {
  solidLeft:  [0.0, 1.0, 0.0],
  solidRight: [1.0, 1.0, 1.0],
};
export const paramSchema = {
  solidLeft:  { type: 'color' },
  solidRight: { type: 'color' },
};

export function render(sceneF32, W, H, t, params, side){
  const rgb = side === 'left' ? params.solidLeft : params.solidRight;
  for(let i=0;i<sceneF32.length;i+=3){
    sceneF32[i]=rgb[0]; sceneF32[i+1]=rgb[1]; sceneF32[i+2]=rgb[2];
  }
}
