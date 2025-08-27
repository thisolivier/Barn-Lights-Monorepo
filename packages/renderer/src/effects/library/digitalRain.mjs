const fract = value => value - Math.floor(value);
const rand = seed => fract(Math.sin(seed) * 43758.5453123);
import { sortColorStops, sampleGradient } from './gradient-utils.mjs';

export const id = 'digitalRain';
export const displayName = 'Digital Rain';
export const defaultParams = {
  dropSpeed: 0.6,
  dropSize: 1,
  numberOfDrops: 40,
  tailLength: 8,
  dropGradient: [
    { pos: 0, color: [0.0, 1.0, 0.0] },
    { pos: 1, color: [0.0, 0.2, 0.0] },
  ],
  backgroundColor: [0.0, 0.0, 0.0],
};
export const paramSchema = {
  dropSpeed: { type: 'number', min: 0, max: 5, step: 0.01, label: 'Drop Speed' },
  dropSize: { type: 'number', min: 1, max: 10, step: 1, label: 'Drop Width' },
  numberOfDrops: { type: 'number', min: 1, max: 200, step: 1, label: 'Drops' },
  tailLength: { type: 'number', min: 1, max: 50, step: 1, label: 'Tail Length' },
  dropGradient: { type: 'colorStops', label: 'Drop Gradient' },
  backgroundColor: { type: 'color', label: 'Background Color' },
};

export function render(sceneF32, width, height, time, params){
  const {
    dropSpeed = defaultParams.dropSpeed,
    dropSize = defaultParams.dropSize,
    numberOfDrops = defaultParams.numberOfDrops,
    tailLength = defaultParams.tailLength,
    dropGradient = defaultParams.dropGradient,
    backgroundColor = defaultParams.backgroundColor,
  } = params || {};

  for (let pixelIndex = 0; pixelIndex < sceneF32.length; pixelIndex += 3){
    sceneF32[pixelIndex] = backgroundColor[0];
    sceneF32[pixelIndex + 1] = backgroundColor[1];
    sceneF32[pixelIndex + 2] = backgroundColor[2];
  }

  const maximumX = Math.max(1, width - dropSize);
  const cycle = height + tailLength;
  const sortedStops = sortColorStops(dropGradient);

  for (let dropIndex = 0; dropIndex < numberOfDrops; dropIndex++){
    const dropX = Math.floor(rand(dropIndex) * maximumX);
    const offset = rand(dropIndex + 1000) * cycle;
    const headY = (time * dropSpeed * height + offset) % cycle;
    for (let tailIndex = 0; tailIndex < tailLength; tailIndex++){
      const yPosition = Math.floor(headY) - tailIndex;
      if (yPosition < 0 || yPosition >= height) continue;
      const fade = 1 - tailIndex / tailLength;
      const gradientColor = sampleGradient(sortedStops, tailIndex / tailLength);
      const red = gradientColor[0] * fade;
      const green = gradientColor[1] * fade;
      const blue = gradientColor[2] * fade;
      for (let xPosition = dropX; xPosition < dropX + dropSize && xPosition < width; xPosition++){
        const index = (yPosition * width + xPosition) * 3;
        sceneF32[index] = red;
        sceneF32[index + 1] = green;
        sceneF32[index + 2] = blue;
      }
    }
  }
}

