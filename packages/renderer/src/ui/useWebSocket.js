import { useEffect, useRef, useState, useCallback } from 'react';

export function useWebSocket(url, { enabled = true, onInit, onParams, onAudio, onError } = {}) {
  const socketRef = useRef(null);
  const [readyState, setReadyState] = useState('closed');

  const initCallbackRef = useRef(onInit);
  const paramsCallbackRef = useRef(onParams);
  const audioCallbackRef = useRef(onAudio);
  const errorCallbackRef = useRef(onError);

  useEffect(() => {
    initCallbackRef.current = onInit;
  }, [onInit]);

  useEffect(() => {
    paramsCallbackRef.current = onParams;
  }, [onParams]);

  useEffect(() => {
    audioCallbackRef.current = onAudio;
  }, [onAudio]);

  useEffect(() => {
    errorCallbackRef.current = onError;
  }, [onError]);

  const send = useCallback((objectToSend) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(objectToSend));
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let socket = null;
    try {
      console.log(`Attempting WebSocket connection to ${url}`);
      socket = new WebSocket(url);
      socketRef.current = socket;
      setReadyState('connecting');

      socket.onerror = (event) => {
        console.error('WebSocket error', event);
        setReadyState('error');
        if (errorCallbackRef.current) errorCallbackRef.current('WebSocket connection error');
      };

      socket.onclose = (event) => {
        console.log('WebSocket closed', event);
        setReadyState('closed');
        if (errorCallbackRef.current) errorCallbackRef.current('WebSocket connection closed');
      };

      socket.onopen = () => {
        console.log('WebSocket opened');
        setReadyState('open');
      };

      socket.onmessage = (event) => {
        console.log('WebSocket message received', event.data);
        const message = JSON.parse(event.data);
        if (message.type === 'init' && initCallbackRef.current) initCallbackRef.current(message);
        if (message.type === 'params' && paramsCallbackRef.current) paramsCallbackRef.current(message);
        if (message.type === 'audio' && audioCallbackRef.current) audioCallbackRef.current(message);
      };
    } catch (err) {
      console.error('Failed to create WebSocket', err);
      setReadyState('error');
      if (errorCallbackRef.current) errorCallbackRef.current('Failed to connect to server');
    }

    return () => {
      if (socket) {
        console.log('Closing WebSocket connection');
        socket.close();
      }
    };
  }, [url, enabled]);

  return { readyState, send };
}
