import { sliceSection, clamp01 } from "../effects/modifiers.mjs";
import { renderFrames } from "../render-scene.mjs";

let leftImage = null;
let rightImage = null;

export function clearImageCaches() {
  leftImage = null;
  rightImage = null;
}

export function drawSceneToCanvas(canvasContext, sceneFloat32, sceneWidth, sceneHeight, side){
  let image = side === "left" ? leftImage : rightImage;
  if (!image || image.width !== sceneWidth || image.height !== sceneHeight) {
    image = canvasContext.createImageData(sceneWidth, sceneHeight);
    if (side === "left") leftImage = image; else rightImage = image;
  }
  const dimFactor = 0.75; // dim factor for non-pixel regions
  const pixelArray = image.data;
  for (let floatIndex = 0, byteIndex = 0; floatIndex < sceneFloat32.length; floatIndex += 3, byteIndex += 4){
    pixelArray[byteIndex]   = Math.round(clamp01(sceneFloat32[floatIndex]) * 255 * dimFactor);
    pixelArray[byteIndex+1] = Math.round(clamp01(sceneFloat32[floatIndex+1]) * 255 * dimFactor);
    pixelArray[byteIndex+2] = Math.round(clamp01(sceneFloat32[floatIndex+2]) * 255 * dimFactor);
    pixelArray[byteIndex+3] = 255;
  }
  canvasContext.imageSmoothingEnabled = false;
  canvasContext.putImageData(image, 0, 0);
}

export function drawSectionsToCanvas(canvasContext, sceneFloat32, layout, sceneWidth, sceneHeight){
  const canvasWidth = canvasContext.canvas.width, canvasHeight = canvasContext.canvas.height;
  canvasContext.lineWidth = 6;
  // Faint guideline for non-pixel wires
  canvasContext.strokeStyle = "rgba(255,255,255,0.9)";
  layout.runs.forEach(run => {
    run.sections.forEach(section => {
      const y = section.y * canvasHeight;
      const x0 = (section.x0 / layout.sampling.width) * canvasWidth;
      const x1 = (section.x1 / layout.sampling.width) * canvasWidth;

      canvasContext.beginPath(); canvasContext.moveTo(x0 - 3, y); canvasContext.lineTo(x1 + 3, y); canvasContext.stroke();

      const bytes = sliceSection(sceneFloat32, sceneWidth, sceneHeight, section, layout.sampling);
      for (let index = 0; index < section.led_count; index++){
        const fraction = section.led_count > 1 ? index / (section.led_count - 1) : 0;
        const x = x0 + (x1 - x0) * fraction;
        const byteIndex = index * 3;
        const r = bytes[byteIndex];
        const g = bytes[byteIndex+1];
        const b = bytes[byteIndex+2];
        canvasContext.fillStyle = `rgb(${r},${g},${b})`;
        canvasContext.fillRect(x-2, y-2, 4, 4);
      }
    });
  });
}

// render a single preview frame to both canvases
export function renderPreviewFrame(
  browserWindow,
  contextLeft, contextRight,
  leftFrame, rightFrame,
  getParams,
  layoutLeft, layoutRight,
  sceneWidth, sceneHeight
) {
  console.log('renderPreviewFrame start');
  const timeSeconds = browserWindow.performance.now() / 1000;
  const paramObject = getParams();
  renderFrames(leftFrame, rightFrame, paramObject, timeSeconds);
  drawSceneToCanvas(contextLeft, leftFrame, sceneWidth, sceneHeight, "left");
  if (layoutLeft) drawSectionsToCanvas(contextLeft, leftFrame, layoutLeft, sceneWidth, sceneHeight);
  drawSceneToCanvas(contextRight, rightFrame, sceneWidth, sceneHeight, "right");
  if (layoutRight) drawSectionsToCanvas(contextRight, rightFrame, layoutRight, sceneWidth, sceneHeight);
  console.log('renderPreviewFrame end');
}
