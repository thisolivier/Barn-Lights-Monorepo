import { sliceSection, clamp01 } from "../effects/modifiers.mjs";
import { renderFrames } from "../render-scene.mjs";

function drawSceneToCanvas(ctx, sceneF32, sceneW, sceneH){
  const img = ctx.createImageData(sceneW, sceneH);
  const dim = 0.75; // dim factor for non-pixel regions
  for (let i = 0, j = 0; i < sceneF32.length; i += 3, j += 4){
    img.data[j]   = Math.round(clamp01(sceneF32[i]) * 255 * dim);
    img.data[j+1] = Math.round(clamp01(sceneF32[i+1]) * 255 * dim);
    img.data[j+2] = Math.round(clamp01(sceneF32[i+2]) * 255 * dim);
    img.data[j+3] = 255;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.putImageData(img, 0, 0);
}

function drawSectionsToCanvas(ctx, sceneF32, layout, sceneW, sceneH){
  const Wc = ctx.canvas.width, Hc = ctx.canvas.height;
  ctx.lineWidth = 6;
  // Faint guideline for non-pixel wires
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  layout.runs.forEach(run => {
    run.sections.forEach(sec => {
      const y = sec.y * Hc;
      const x0 = (sec.x0 / layout.sampling.width) * Wc;
      const x1 = (sec.x1 / layout.sampling.width) * Wc;

      ctx.beginPath(); ctx.moveTo(x0 - 3, y); ctx.lineTo(x1 + 3, y); ctx.stroke();

      const bytes = sliceSection(sceneF32, sceneW, sceneH, sec, layout.sampling);
      for (let i = 0; i < sec.led_count; i++){
        const t = sec.led_count > 1 ? i / (sec.led_count - 1) : 0;
        const x = x0 + (x1 - x0) * t;
        const j = i * 3;
        const r = bytes[j];
        const g = bytes[j+1];
        const b = bytes[j+2];
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x-2, y-2, 4, 4);
      }
    });
  });
}

// frame: render once, draw to both previews, then schedule the next loop
export function frame(
  win,
  ctxL, ctxR,
  leftFrame, rightFrame,
  P,
  layoutLeft, layoutRight,
  sceneW, sceneH
) {
  const t = win.performance.now() / 1000;
  renderFrames(leftFrame, rightFrame, P, t);
  drawSceneToCanvas(ctxL, leftFrame, sceneW, sceneH);
  if (layoutLeft) drawSectionsToCanvas(ctxL, leftFrame, layoutLeft, sceneW, sceneH);
  drawSceneToCanvas(ctxR, rightFrame, sceneW, sceneH);
  if (layoutRight) drawSectionsToCanvas(ctxR, rightFrame, layoutRight, sceneW, sceneH);
  win.requestAnimationFrame(() => frame(win, ctxL, ctxR, leftFrame, rightFrame, P, layoutLeft, layoutRight, sceneW, sceneH));
}
