import http from "http";
import { WebSocketServer } from "ws";
import { createReadStream } from "fs";
import path from "path";
import url from "url";

import { params, updateParams, layoutLeft, layoutRight, SCENE_W, SCENE_H } from "./engine.mjs";
import { savePreset, loadPreset, listPresets } from "./config-store.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const UI_DIR = path.join(__dirname, "ui");

function streamFile(p, mime, res){
  const s = createReadStream(p);
  res.writeHead(200, { "Content-Type": mime });
  s.pipe(res);
}
function sendJson(obj, res){
  const buf = Buffer.from(JSON.stringify(obj));
  res.writeHead(200, { "Content-Type": "application/json" }).end(buf);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x/");
  if (u.pathname === "/") return streamFile(path.join(UI_DIR, "index.html"), "text/html", res);
  if (u.pathname === "/preview.mjs") return streamFile(path.join(UI_DIR, "preview.mjs"), "text/javascript", res);
  if (u.pathname === "/main.mjs") return streamFile(path.join(UI_DIR, "main.mjs"), "text/javascript", res);
  if (u.pathname === "/connection.mjs") return streamFile(path.join(UI_DIR, "connection.mjs"), "text/javascript", res);
  if (u.pathname === "/controls-logic.mjs") return streamFile(path.join(UI_DIR, "controls-logic.mjs"), "text/javascript", res);
  if (u.pathname === "/presets.mjs") return streamFile(path.join(UI_DIR, "presets.mjs"), "text/javascript", res);
  if (u.pathname === "/renderer.mjs") return streamFile(path.join(UI_DIR, "renderer.mjs"), "text/javascript", res);
  if (u.pathname === "/render-scene.mjs") return streamFile(path.join(__dirname, "render-scene.mjs"), "text/javascript", res);
  if (u.pathname.startsWith("/subviews/")) {
    const p = path.join(UI_DIR, u.pathname.slice(1));
    return streamFile(p, "text/javascript", res);
  }
  if (u.pathname.startsWith("/vendor/")) {
    const p = path.join(__dirname, "../node_modules", u.pathname.slice(8));
    const ext = path.extname(p);
    const mime = ext === ".css" ? "text/css" : "text/javascript";
    return streamFile(p, mime, res);
  }
  if (u.pathname === "/favicon.ico") return streamFile(path.join(UI_DIR, "favicon.ico"), "image/x-icon", res);
  if (u.pathname.startsWith("/effects/")) {
    const p = path.join(__dirname, u.pathname.slice(1));
    return streamFile(p, "text/javascript", res);
  }
  if (u.pathname === "/layout/left") return sendJson(layoutLeft, res);
  if (u.pathname === "/layout/right") return sendJson(layoutRight, res);
  if (u.pathname === "/presets") return sendJson(await listPresets(), res);
  if (u.pathname.startsWith("/preset/save/")) {
    const name = u.pathname.slice("/preset/save/".length);
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const buf = chunks.length ? Buffer.concat(chunks) : null;
    await savePreset(name, params, buf);
    return sendJson({ ok: true }, res);
  }
  if (u.pathname.startsWith("/preset/load/")) {
    const name = u.pathname.slice("/preset/load/".length);
    try {
      const loaded = await loadPreset(name);
      Object.assign(params, loaded);
      for (const c of wss.clients) if (c.readyState === 1) c.send(JSON.stringify({ type: "params", params }));
      return sendJson({ ok: true }, res);
    } catch {
      res.writeHead(404).end("Not found");
      return;
    }
  }
  if (u.pathname.startsWith("/preset/preview/")) {
    const name = decodeURIComponent(u.pathname.slice("/preset/preview/".length));
    const p = path.join(__dirname, "../config/presets", `${name}.png`);
    try {
      return streamFile(p, "image/png", res);
    } catch {
      res.writeHead(404).end("Not found");
      return;
    }
  }
  res.writeHead(404).end("Not found");
});

const wss = new WebSocketServer({ server });
wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "init", params, scene: { w: SCENE_W, h: SCENE_H } }));
  ws.on("message", msg => {
    try {
      const patch = JSON.parse(msg.toString());
      updateParams(patch);
      for (const c of wss.clients) if (c.readyState === 1) c.send(JSON.stringify({ type: "params", params }));
    } catch {}
  });
});

export function startServer(port = 8080){
  server.listen(port, () => {
    console.error(`UI: http://localhost:${port}`);
  });
}

const isMain = url.pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  startServer();
}
