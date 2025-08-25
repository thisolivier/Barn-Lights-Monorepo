export let socket = null;

export function initConnection(win, onInit, onParams, onError){
  try {
    socket = new win.WebSocket(`ws://${win.location.host}`);
    socket.onerror = (ev)=>{ console.error("WebSocket error", ev); if(onError) onError("WebSocket connection error"); };
    socket.onclose = (ev)=>{ console.warn("WebSocket closed", ev); if(onError) onError("WebSocket connection closed"); };
    socket.onmessage = (ev)=>{
      const m = JSON.parse(ev.data);
      if (m.type === "init" && onInit) onInit(m);
      if (m.type === "params" && onParams) onParams(m);
    };
  } catch(err){
    console.error("Failed to create WebSocket", err);
    if (onError) onError("Failed to connect to server");
  }
}

export function send(obj){
  if (socket && socket.readyState === 1) socket.send(JSON.stringify(obj));
}
