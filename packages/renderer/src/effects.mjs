// src/effects.mjs

// ---------- utilities ----------
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
const mix = (a,b,t)=> a + (b-a)*t;
const mix3 = (A,B,t)=> [mix(A[0],B[0],t), mix(A[1],B[1],t), mix(A[2],B[2],t)];

// ---------- noise for fire (fast "value noise" + FBM) ----------
function vnoise2(x,y){
  return 0.5 + 0.5 * Math.sin( (x*12.9898 + y*78.233) * 43758.5453 );
}
function fbm(x,y,oct=4){
  let a=0, f=1, amp=0.5;
  for(let i=0;i<oct;i++){ a += amp*vnoise2(x*f,y*f); f*=2; amp*=0.5; }
  return a;
}

// ---------- generators (Stage A) ----------
export function genGradient(sceneF32, W, H, t, params) {
  const { gradStart, gradEnd, gradPhase=0 } = params;
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const u = (x/W + gradPhase) % 1;
      const rgb = mix3(gradStart, gradEnd, u);
      const i=(y*W+x)*3;
      sceneF32[i]=rgb[0]; sceneF32[i+1]=rgb[1]; sceneF32[i+2]=rgb[2];
    }
  }
}

export function genSolid(sceneF32, W, H, t, params, side) {
  const rgb = side==="left" ? params.solidLeft : params.solidRight;
  for(let i=0;i<sceneF32.length;i+=3){ sceneF32[i]=rgb[0]; sceneF32[i+1]=rgb[1]; sceneF32[i+2]=rgb[2]; }
}

export function genFire(sceneF32, W, H, t, params) {
  const { fireSpeed=0.35, fireScale=2.2, fireIntensity=1.2 } = params;
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const n = fbm(x/(W/fireScale), (y/(H/fireScale)) - t*fireSpeed, 4);
      const heat = Math.pow(clamp01(n*1.2 - (1 - y/H)*0.6), 1.2) * fireIntensity;
      let rgb;
      if (heat < 0.33)      rgb = mix3([0,0,0],[1,0,0], heat/0.33);
      else if (heat<0.66)   rgb = mix3([1,0,0],[1,0.5,0], (heat-0.33)/0.33);
      else                  rgb = mix3([1,0.5,0],[1,1,1], (heat-0.66)/0.34);
      const i=(y*W+x)*3;
      sceneF32[i]=rgb[0]; sceneF32[i+1]=rgb[1]; sceneF32[i+2]=rgb[2];
    }
  }
}

// ---------- modifiers (Stage B) ----------
export function applyBrightnessTint(sceneF32, tint, brightness){
  const [tr,tg,tb]=tint; const g=brightness;
  for(let i=0;i<sceneF32.length;i+=3){
    sceneF32[i]   = clamp01(sceneF32[i]  * tr * g);
    sceneF32[i+1] = clamp01(sceneF32[i+1]* tg * g);
    sceneF32[i+2] = clamp01(sceneF32[i+2]* tb * g);
  }
}

export function applyGamma(sceneF32, gamma=1.0){
  if (Math.abs(gamma-1.0)<1e-3) return;
  const inv = 1/gamma;
  for(let i=0;i<sceneF32.length;i++) sceneF32[i] = Math.pow(clamp01(sceneF32[i]), inv);
}

export function applyStrobe(sceneF32, t, hz=0, duty=0.5, low=0.0){
  if (hz<=0) return;
  const period = 1/Math.max(0.001, hz);
  const phase = (t % period)/period;
  const mult = phase < duty ? 1.0 : low;
  if (mult===1) return;
  for(let i=0;i<sceneF32.length;i++) sceneF32[i] *= mult;
}

export function applyRollX(sceneF32, W, H, px){
  const shift = ((px % W)+W)%W;
  if (shift===0) return;
  const rowBytes = W*3;
  for(let y=0;y<H;y++){
    const off = y*rowBytes;
    const src = sceneF32.slice(off, off+rowBytes);
    for(let x=0;x<W;x++){
      const sx = (x+shift)%W;
      sceneF32[off+x*3+0] = src[sx*3+0];
      sceneF32[off+x*3+1] = src[sx*3+1];
      sceneF32[off+x*3+2] = src[sx*3+2];
    }
  }
}

// ---------- sampling (Stage C) ----------
export function bilinearSampleRGB(sceneF32, W, H, sx, sy){
  sx = Math.max(0, Math.min(W-1, sx));
  sy = Math.max(0, Math.min(H-1, sy));
  const x0 = Math.floor(sx), x1 = Math.min(W-1, x0+1);
  const y0 = Math.floor(sy), y1 = Math.min(H-1, y0+1);
  const tx = sx - x0, ty = sy - y0;
  const i00 = (y0*W + x0)*3, i10 = (y0*W + x1)*3, i01 = (y1*W + x0)*3, i11 = (y1*W + x1)*3;
  const L = (a,b,t)=> a + (b-a)*t;
  return [
    L(L(sceneF32[i00],   sceneF32[i10],   tx), L(sceneF32[i01],   sceneF32[i11],   tx), ty),
    L(L(sceneF32[i00+1], sceneF32[i10+1], tx), L(sceneF32[i01+1], sceneF32[i11+1], tx), ty),
    L(L(sceneF32[i00+2], sceneF32[i10+2], tx), L(sceneF32[i01+2], sceneF32[i11+2], tx), ty),
  ];
}

export function sliceSection(sceneF32, W, H, section, sampling){
  const out = new Uint8Array(section.led_count*3);
  for (let i=0;i<section.led_count;i++){
    const t = section.led_count>1 ? i/(section.led_count-1) : 0;
    const xNorm = section.x0 + (section.x1 - section.x0) * t;
    const yNorm = section.y;
    const sx = (xNorm / sampling.width)  * (W-1);
    const sy = (yNorm / sampling.height) * (H-1);
    const [r,g,b] = bilinearSampleRGB(sceneF32, W, H, sx, sy);
    const j = i*3;
    out[j]   = Math.round(clamp01(r) * 255);
    out[j+1] = Math.round(clamp01(g) * 255);
    out[j+2] = Math.round(clamp01(b) * 255);
  }
  return out;
}
