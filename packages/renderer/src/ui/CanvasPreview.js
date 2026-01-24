import React, { useEffect, useRef } from 'react';
import { drawSceneToCanvas, drawSectionsToCanvas, clearImageCaches } from './render-preview-frame.mjs';
import { renderFrames } from '../render-scene.mjs';
import { tickReboot } from './reboot.mjs';

export default function CanvasPreview({
  getParams,
  layoutLeft,
  layoutRight,
  sceneWidth,
  sceneHeight,
  shouldAnimate = true
}) {
  const canvasLeftRef = useRef(null);
  const canvasRightRef = useRef(null);

  useEffect(() => {
    if (!sceneWidth || !sceneHeight) return;
    const canvasLeft = canvasLeftRef.current;
    const canvasRight = canvasRightRef.current;
    if (!canvasLeft || !canvasRight) return;

    const contextLeft = canvasLeft.getContext('2d');
    const contextRight = canvasRight.getContext('2d');
    const leftFrame = new Float32Array(sceneWidth * sceneHeight * 3);
    const rightFrame = new Float32Array(sceneWidth * sceneHeight * 3);
    let frameRequest = 0;
    const win = canvasLeft.ownerDocument.defaultView || window;

    const loop = () => {
      const timeSeconds = win.performance.now() / 1000;
      const currentParams = getParams();

      renderFrames(leftFrame, rightFrame, currentParams, timeSeconds);
      drawSceneToCanvas(contextLeft, leftFrame, sceneWidth, sceneHeight, "left");
      if (layoutLeft) drawSectionsToCanvas(contextLeft, leftFrame, layoutLeft, sceneWidth, sceneHeight);
      drawSceneToCanvas(contextRight, rightFrame, sceneWidth, sceneHeight, "right");
      if (layoutRight) drawSectionsToCanvas(contextRight, rightFrame, layoutRight, sceneWidth, sceneHeight);

      tickReboot(win.performance.now());

      if (shouldAnimate) {
        frameRequest = win.requestAnimationFrame(loop);
      }
    };

    if (shouldAnimate) {
      frameRequest = win.requestAnimationFrame(loop);
    } else {
      loop();
    }

    return () => {
      if (frameRequest && shouldAnimate) win.cancelAnimationFrame(frameRequest);
      clearImageCaches();
    };
  }, [getParams, layoutLeft, layoutRight, sceneWidth, sceneHeight, shouldAnimate]);

  return React.createElement(
    'div',
    { className: 'barn' },
    React.createElement('canvas', { id: 'left', ref: canvasLeftRef, width: '512', height: '128' }),
    React.createElement('canvas', { id: 'right', ref: canvasRightRef, width: '512', height: '128' })
  );
}
