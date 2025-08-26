import http from "http";
import { WebSocketServer } from "ws";
import { createReadStream } from "fs";
import path from "path";
import url from "url";

import { params, updateParams, layoutLeft, layoutRight, SCENE_W, SCENE_H } from "./engine.mjs";

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

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x/");
  if (u.pathname === "/") return streamFile(path.join(UI_DIR, "index.html"), "text/html", res);
  if (u.pathname === "/preview.mjs") return streamFile(path.join(UI_DIR, "preview.mjs"), "text/javascript", res);
  if (u.pathname === "/main.mjs") return streamFile(path.join(UI_DIR, "main.mjs"), "text/javascript", res);
  if (u.pathname === "/connection.mjs") return streamFile(path.join(UI_DIR, "connection.mjs"), "text/javascript", res);
  if (u.pathname === "/ui-controls.mjs") return streamFile(path.join(UI_DIR, "ui-controls.mjs"), "text/javascript", res);
  if (u.pathname === "/renderer.mjs") return streamFile(path.join(UI_DIR, "renderer.mjs"), "text/javascript", res);
  if (u.pathname.startsWith("/controls/")) {
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
