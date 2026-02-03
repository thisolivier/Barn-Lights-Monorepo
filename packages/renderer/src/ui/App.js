import React, { useCallback, useEffect, useState } from 'react';
import { run as defaultRun } from './layout-service.js';
import { WebSocketProvider } from './WebSocketContext.js';
import { ParamsProvider } from './ParamsContext.js';
import ControlPanel from './ControlPanel.js';
import CanvasPreview from './CanvasPreview.js';
import CalibrationPage from './CalibrationPage.js';

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
  const [currentPage, setCurrentPage] = useState(() => {
    return window.location.hash === '#/calibration' ? 'calibration' : 'main';
  });

  // Handle hash changes for routing
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPage(window.location.hash === '#/calibration' ? 'calibration' : 'main');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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

  // Handler for layout updates from WebSocket
  const handleLayoutUpdate = useCallback((side, layout) => {
    setLayouts(prev => ({
      ...prev,
      [side]: layout
    }));
  }, []);

  const { onInit, onParams, onStatus } = handlers || {
    onInit: () => {},
    onParams: () => {},
    onStatus: () => {}
  };

  // Wrap onInit to also handle layout updates
  const wrappedOnInit = useCallback((message) => {
    onInit(message);
  }, [onInit]);

  // Create a message handler that routes layout updates
  const handleMessage = useCallback((message) => {
    if (message.type === 'layoutUpdate') {
      handleLayoutUpdate(message.side, message.layout);
      return;
    }
    if (message.type === 'params') {
      onParams(message);
    }
  }, [onParams, handleLayoutUpdate]);

  const renderContent = () => {
    if (currentPage === 'calibration') {
      return React.createElement(CalibrationPage, {
        layouts,
        setLayouts,
        scene,
        runtime,
        sendWsMessage: sendFunction
      });
    }

    // Main page (default)
    return [
      (runtime && layouts.left && layouts.right && scene.width && scene.height
        ? React.createElement(CanvasPreview, {
            key: "preview",
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
      })
    ];
  };

  return React.createElement(
    ParamsProviderComponent,
    { send: sendFunction, onReady: handleReady },
    React.createElement(
      WebSocketProviderComponent,
      {
        enabled: handlersReady,
        onInit: wrappedOnInit,
        onParams: handleMessage,
        onError: onStatus,
        setSend: setSendFunction
      },
      renderContent()
    )
  );
}
