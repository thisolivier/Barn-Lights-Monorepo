import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react';

function deepMerge(baseObject, patchObject) {
  const resultObject = { ...baseObject };
  for (const [patchKey, patchValue] of Object.entries(patchObject)) {
    if (patchValue && typeof patchValue === 'object' && !Array.isArray(patchValue)) {
      resultObject[patchKey] = deepMerge(baseObject[patchKey] || {}, patchValue);
    } else {
      resultObject[patchKey] = patchValue;
    }
  }
  return resultObject;
}

function paramsReducer(currentState, patchObject) {
  return deepMerge(currentState, patchObject);
}

export const ParamsContext = createContext(null);

export function ParamsProvider({ children, send, onReady }) {
  const safeSend = send || (() => {});
  const [paramsState, localDispatch] = useReducer(paramsReducer, {});
  const paramsRef = useRef(paramsState);

  paramsRef.current = paramsState;

  const applyPatch = useCallback((patchObject, broadcast = true) => {
    localDispatch(patchObject);
    if (broadcast) safeSend(patchObject);
  }, [safeSend]);

  const contextValue = {
    params: paramsState,
    dispatch: applyPatch,
    sendPatch: safeSend,
    getParams: () => paramsRef.current
  };

  const applyLocal = useCallback((patchObject) => applyPatch(patchObject, false), [applyPatch]);

  const isReadyRef = useRef(false);

  useEffect(() => {
    if (onReady && !isReadyRef.current) {
      isReadyRef.current = true;
      onReady({ dispatch: applyPatch, applyLocal, getParams: () => paramsRef.current });
    }
  }, [onReady, applyPatch, applyLocal]);

  return React.createElement(
    ParamsContext.Provider,
    { value: contextValue },
    children
  );
}

export function useParamsContext() {
  return useContext(ParamsContext);
}

