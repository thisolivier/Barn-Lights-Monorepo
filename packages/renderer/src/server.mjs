import http from "http";
import { WebSocketServer } from "ws";
import { createReadStream } from "fs";
import path from "path";
import url from "url";

import { createLogger } from '@led-lights/shared/udp-logger';
import { params, updateParams, getLayoutLeft, getLayoutRight, SCENE_W, SCENE_H } from "./engine.mjs";
import { savePreset, loadPreset, listPresets } from "./config-store.mjs";
import { audioState, updateAudioState, updateAudioSettings } from "./audio-state.mjs";

const logger = createLogger({
  component: 'renderer.server',
  target: { host: '127.0.0.1', port: 49800 }
});

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const UI_DIR = path.join(__dirname, "ui");
const UI_DIST_DIR = path.join(UI_DIR, "dist");

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
  // React bundle - served from webpack dist output
  if (u.pathname === "/") return streamFile(path.join(UI_DIST_DIR, "index.html"), "text/html", res);
  if (u.pathname === "/bundle.js") return streamFile(path.join(UI_DIST_DIR, "bundle.js"), "text/javascript", res);
  // ES modules loaded directly by the React bundle at runtime
  if (u.pathname === "/connection.mjs") return streamFile(path.join(UI_DIR, "connection.mjs"), "text/javascript", res);
  if (u.pathname === "/presets.mjs") return streamFile(path.join(UI_DIR, "presets.mjs"), "text/javascript", res);
  if (u.pathname === "/reboot.mjs") return streamFile(path.join(UI_DIR, "reboot.mjs"), "text/javascript", res);
  if (u.pathname === "/render-scene.mjs") return streamFile(path.join(__dirname, "render-scene.mjs"), "text/javascript", res);
  if (u.pathname.startsWith("/subviews/")) {
    const p = path.join(UI_DIR, u.pathname.slice(1));
    return streamFile(p, "text/javascript", res);
  }
  if (u.pathname.startsWith("/vendor/")) {
    // In monorepo, node_modules is at the root level
    const p = path.join(__dirname, "../../../node_modules", u.pathname.slice(8));
    const ext = path.extname(p);
    const mime = ext === ".css" ? "text/css" : "text/javascript";
    return streamFile(p, mime, res);
  }
  if (u.pathname === "/favicon.ico") return streamFile(path.join(UI_DIR, "favicon.ico"), "image/x-icon", res);
  if (u.pathname.startsWith("/effects/")) {
    const p = path.join(__dirname, u.pathname.slice(1));
    return streamFile(p, "text/javascript", res);
  }
  if (u.pathname === "/layout/left") return sendJson(getLayoutLeft(), res);
  if (u.pathname === "/layout/right") return sendJson(getLayoutRight(), res);
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
      await loadPreset(name, params);
      for (const client of wss.clients) {
        if (client.readyState === 1) client.send(JSON.stringify({ type: "params", params }));
      }
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
  // Send current audio state to new connections
  ws.send(JSON.stringify({ type: "audio", audio: audioState }));

  ws.on("message", msg => {
    try {
      const data = JSON.parse(msg.toString());

      // Handle audio feature updates from audio package
      if (data.type === 'audio') {
        updateAudioState(data);
        // Broadcast audio state to all UI clients
        const audioMsg = JSON.stringify({ type: "audio", audio: audioState });
        for (const c of wss.clients) {
          if (c.readyState === 1) c.send(audioMsg);
        }
        return;
      }

      // Handle audio settings updates from UI
      if (data.type === 'audioSettings') {
        updateAudioSettings(data.settings);
        // Broadcast updated settings to all UI clients
        const audioMsg = JSON.stringify({ type: "audio", audio: audioState });
        for (const c of wss.clients) {
          if (c.readyState === 1) c.send(audioMsg);
        }
        return;
      }

      // Handle regular parameter updates (backwards compatible)
      updateParams(data);
      for (const c of wss.clients) if (c.readyState === 1) c.send(JSON.stringify({ type: "params", params }));
    } catch {}
  });
});

export function startServer(port = 8080){
  return new Promise((resolve) => {
    server.listen(port, () => {
      const assignedPort = server.address().port;
      logger.info('Server started', { url: `http://localhost:${assignedPort}` });
      resolve(assignedPort);
    });
  });
}

const isMain = url.pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  startServer();
}
