import React, { createContext, useContext, useEffect } from 'react';
import { useWebSocket } from './useWebSocket.js';

export const WebSocketContext = createContext(null);

export function WebSocketProvider({ children, url = `ws://${globalThis.location.host}`, enabled = true, onInit, onParams, onError, setSend }) {
  const { readyState, send } = useWebSocket(url, { enabled, onInit, onParams, onError });

  useEffect(() => {
    if (setSend) setSend(send);
  }, [send, setSend]);

  return React.createElement(
    WebSocketContext.Provider,
    { value: { readyState, send } },
    children
  );
}

export function useWebSocketContext() {
  return useContext(WebSocketContext);
}
