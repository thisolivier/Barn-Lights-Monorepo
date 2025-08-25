// engine.js
const http = require("http");
const fs = require("fs");
const WebSocket = require("ws");

const W = 256, H = 16;
const WALLS = ["left", "right"];
const BYTES_PER_WALL = W * H * 3;

let params = {
  fpsCap: 60,
  effect: "gradient", // "gradient" | "solid" | "fire"
  mirrorWalls: true,
  // Gradient
  gradStart: [0.0, 0.0, 1.0],
  gradEnd:   [1.0, 0.0, 0.0],
  gradPhase: 0.0,
  // Solid
  solidLeft:  [0.0, 1.0, 0.0],
  solidRight: [1.0, 1.0, 1.0],
  // Fire
  fireSpeed: 0.35,
  fireScale: 2.2,
  fireIntensity: 1.2,
  // Post
  brightness: 0.8,
  tint: [1.0, 1.0, 1.0],
  strobeOn: true,
  strobeHz: 6.0,
  strobeDuty: 0.5,
  strobeLow: 0.0,
  rollPx: 0,
  gamma: 1.0,
};

const uiHtml = `
<!doctype html><meta charset=utf-8>
<style>body{font:14px system-ui;margin:20px;max-width:640px}label{display:block;margin:.5rem 0}.row{display:flex;gap:8px;align-items:center}</style>
<h1>BarnLights Playbox</h1>
<div id="ctrls"></div>
<script>
 const socket = new WebSocket("ws://" + location.host);
 const ctrls = [
  ["fpsCap",0,60,1],
  ["brightness",0,1,0.01],
  ["gamma",0.5,3,0.01],
  ["strobeOn",0,1,1,"bool"],
  ["strobeHz",0,20,0.1],
  ["strobeDuty",0,1,0.01],
  ["rollPx",0,${W},1],
  ["gradPhase",0,1,0.001],
  ["mirrorWalls",0,1,1,"bool"],
 ];
 const root = document.getElementById('ctrls');
 function add(name,min,max,step,kind){
   const wrap=document.createElement('label');
   wrap.textContent=name+" ";
   const input=document.createElement('input');
   if(kind==="bool"){ input.type="checkbox"; input.addEventListener('change',()=>send(name,input.checked)); }
   else { input.type='range'; input.min=min; input.max=max; input.step=step; input.value=min; input.addEventListener('input',()=>send(name, parseFloat(input.value))); }
   wrap.appendChild(input); root.appendChild(wrap);
 }
 function send(k,v){ socket.send(JSON.stringify({[k]:v})); }
 ctrls.forEach(c=>add(...c));
 // basic effect switch
 const sel=document.createElement('select'); ["gradient","solid","fire"].forEach(e=>{const o=document.createElement('option');o.text=e;sel.appendChild(o);});
 sel.onchange=()=>send("effect", sel.value);
 document.body.insertBefore(sel, root);
</script>
`;

const server = http.createServer((req, res) => {
  res.writeHead(200, {"Content-Type":"text/html"}); res.end(uiHtml);
});
const wss = new WebSocket.Server({ server });
wss.on("connection", ws => {
  ws.on("message", msg => {
    try { Object.assign(params, JSON.parse(msg)); } catch {}
  });
});
server.listen(8080, ()=> console.log("UI: http://localhost:8080"));

/* ---------- Core math helpers ---------- */
const clamp01 = x => Math.max(0, Math.min(1, x));
const mix = (a,b,t)=> a*(1-t)+b*t;
const mix3 = (A,B,t)=> [mix(A[0],B[0],t), mix(A[1],B[1],t), mix(A[2],B[2],t)];

function lcg(seed){ let s = seed>>>0; return ()=> (s=(1664525*s+1013904223)>>>0, s/0x100000000); }

/* Fast-ish value noise via sin/cos hash */
function vnoise2(x,y){
  return 0.5 + 0.5 * Math.sin( (x*12.9898 + y*78.233) * 43758.5453 );
}
function fbm(x,y,oct=3){
  let a=0, f=1, amp=0.5;
  for(let i=0;i<oct;i++){ a += amp*vnoise2(x*f,y*f); f*=2; amp*=0.5; }
  return a;
}

/* ---------- Generators ---------- */
function genGradient(buf, t){
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const u = (x/W + params.gradPhase) % 1;
      const rgb = mix3(params.gradStart, params.gradEnd, u);
      const i = (y*W + x)*3; buf[i]=rgb[0]; buf[i+1]=rgb[1]; buf[i+2]=rgb[2];
    }
  }
}

function genSolid(buf, leftSide){
  const rgb = leftSide ? params.solidLeft : params.solidRight;
  for(let i=0;i<BYTES_PER_WALL;i+=3){ buf[i]=rgb[0]; buf[i+1]=rgb[1]; buf[i+2]=rgb[2]; }
}

function genFire(buf, t){
  const sp = params.fireSpeed, sc = params.fireScale, inten = params.fireIntensity;
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      // Scroll upward over time (y-t*speed), decayed by height
      const n = fbm(x/(W/sc), (y/(H/sc)) - t*sp, 4);
      const heat = Math.pow(clamp01(n * 1.2 - (1 - y/H)*0.6), 1.2) * inten;
      // Palette: black -> red -> orange -> yellow -> white
      let rgb;
      if (heat < 0.33)      rgb = mix3([0,0,0],[1,0,0], heat/0.33);
      else if (heat<0.66)   rgb = mix3([1,0,0],[1,0.5,0], (heat-0.33)/0.33);
      else                  rgb = mix3([1,0.5,0],[1,1,1], (heat-0.66)/0.34);
      const i=(y*W+x)*3; buf[i]=rgb[0]; buf[i+1]=rgb[1]; buf[i+2]=rgb[2];
    }
  }
}

/* ---------- Modifiers ---------- */
function applyBrightnessTint(buf){
  const [tr,tg,tb]=params.tint, gain=params.brightness;
  for(let i=0;i<BYTES_PER_WALL;i+=3){
    buf[i]   = clamp01(buf[i]  *tr*gain);
    buf[i+1] = clamp01(buf[i+1]*tg*gain);
    buf[i+2] = clamp01(buf[i+2]*tb*gain);
  }
}
function applyGamma(buf){
  if (Math.abs(params.gamma-1.0)<1e-3) return;
  const inv = 1/params.gamma;
  for(let i=0;i<BYTES_PER_WALL;i++) buf[i] = Math.pow(clamp01(buf[i]), inv);
}
function applyStrobe(buf, t){
  if (!params.strobeOn) return;
  const period = 1/Math.max(0.001, params.strobeHz);
  const phase = (t % period)/period;
  const on = phase < params.strobeDuty;
  const mult = on ? 1.0 : params.strobeLow;
  if (mult===1) return;
  for(let i=0;i<BYTES_PER_WALL;i++) buf[i]*=mult;
}
function applyRoll(buf){
  const shift = ((params.rollPx % W)+W)%W;
  if (shift===0) return;
  const rowBytes = W*3;
  for(let y=0;y<H;y++){
    const row = buf.subarray(y*rowBytes, (y+1)*rowBytes);
    const copy = row.slice();
    for(let x=0;x<W;x++){
      const sx = (x+shift)%W;
      row[x*3+0]=copy[sx*3+0];
      row[x*3+1]=copy[sx*3+1];
      row[x*3+2]=copy[sx*3+2];
    }
  }
}

/* ---------- Engine loop ---------- */
const leftF  = new Float32Array(BYTES_PER_WALL);
const rightF = new Float32Array(BYTES_PER_WALL);
const leftB  = Buffer.alloc(BYTES_PER_WALL);
const rightB = Buffer.alloc(BYTES_PER_WALL);

let last = process.hrtime.bigint(), acc=0, frame=0;
function loop(){
  const now = process.hrtime.bigint();
  const dt  = Number(now - last)/1e9; last = now;
  const cap = Math.max(1, params.fpsCap);
  acc += dt; const step = 1/cap;
  if (acc < step) return;
  const t = Number(now)/1e9;
  acc = 0;

  // Stage A
  if (params.effect==="gradient"){
    genGradient(leftF, t);
    if (params.mirrorWalls) rightF.set(leftF); else genGradient(rightF, t);
  } else if (params.effect==="solid"){
    genSolid(leftF, true);
    if (params.mirrorWalls) rightF.set(leftF); else genSolid(rightF, false);
  } else {
    genFire(leftF, t);
    if (params.mirrorWalls) rightF.set(leftF); else genFire(rightF, t);
  }

  // Stage B
  [leftF,rightF].forEach(buf=>{
    applyStrobe(buf, t);
    applyBrightnessTint(buf);
    applyGamma(buf);
    applyRoll(buf);
  });

  // Pack to RGB8
  for(let i=0;i<BYTES_PER_WALL;i++){
    leftB[i]  = Math.round(clamp01(leftF[i]) * 255);
    rightB[i] = Math.round(clamp01(rightF[i]) * 255);
  }

  // Emit NDJSON
  const out = {
    ts: Math.floor(Date.now()/1000),
    frame: frame++,
    fps: cap,
    walls: {
      left:  { w: W, h: H, format: "rgb8", data_b64: leftB.toString('base64') },
      right: { w: W, h: H, format: "rgb8", data_b64: rightB.toString('base64') }
    }
  };
  process.stdout.write(JSON.stringify(out) + "\n");
}
setInterval(loop, 1);
