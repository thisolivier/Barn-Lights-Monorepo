import React, { useCallback, useEffect, useState } from 'react';
import { run as defaultRun } from './layout-service.js';
import { WebSocketProvider } from './WebSocketContext.js';
import { ParamsProvider } from './ParamsContext.js';
import ControlPanel from './ControlPanel.js';
import CanvasPreview from './CanvasPreview.js';
import AudioPanel from './AudioPanel.js';

export default function App({
  runFunction = defaultRun,
  renderFrame,
  shouldAnimate = true,
  ParamsProviderComponent = ParamsProvider,
  WebSocketProviderComponent = WebSocketProvider
}) {
  const [handlers, setHandlers] = useState(null);
  const [handlersReady, setHandlersReady] = useState(false);
  const [sendFunction, setSendFunction] = useState(() => {});
  const [runtime, setRuntime] = useState(null);
  const [layouts, setLayouts] = useState({ left: null, right: null });
  const [scene, setScene] = useState({ width: 0, height: 0 });
  const [audioState, setAudioState] = useState(null);

  const handleReady = useCallback((runtimeValue) => {
    console.log('Runtime initialized');
    setRuntime(runtimeValue);
  }, []);

  useEffect(() => {
    if (runtime) {
      runFunction(runtime.applyLocal, setScene).then(result => {
        setHandlers(result);
        setLayouts({ left: result.layoutLeft, right: result.layoutRight });
        setHandlersReady(true);
        console.log('Layouts loaded, handlers ready');
      });
    }
  }, [runtime, runFunction]);

  useEffect(() => {
    if (runtime && layouts.left && layouts.right && scene.width && scene.height) {
      console.log('CanvasPreview mounted');
    }
  }, [runtime, layouts.left, layouts.right, scene.width, scene.height]);

  const { onInit, onParams, onStatus } = handlers || {
    onInit: () => {},
    onParams: () => {},
    onStatus: () => {}
  };

  // Handle audio state updates from WebSocket
  const onAudio = useCallback((message) => {
    if (message.audio) {
      setAudioState(message.audio);
    }
  }, []);

  return React.createElement(
    ParamsProviderComponent,
    { send: sendFunction, onReady: handleReady },
    React.createElement(
      WebSocketProviderComponent,
      { enabled: handlersReady, onInit, onParams, onAudio, onError: onStatus, setSend: setSendFunction },
      [ 
        (runtime && layouts.left && layouts.right && scene.width && scene.height
        ? React.createElement(CanvasPreview, {
            getParams: runtime.getParams,
            layoutLeft: layouts.left,
            layoutRight: layouts.right,
            sceneWidth: scene.width,
            sceneHeight: scene.height,
            shouldAnimate
          })
        : null), 
        React.createElement(ControlPanel, {
          key: "control"
        }),
        React.createElement(AudioPanel, {
          key: "audio",
          audioState: audioState
        })
      ]
    )
  );
}

