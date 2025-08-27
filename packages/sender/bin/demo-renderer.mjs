import fs from 'fs';

function parseFramesPerSecond() {
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf('--fps');
  if (flagIndex !== -1 && args[flagIndex + 1]) {
    const value = Number(args[flagIndex + 1]);
    if (!Number.isNaN(value) && value > 0) {
      return value;
    }
  }
  return 1;
}

function loadLayout(path) {
  const url = new URL(path, import.meta.url);
  return JSON.parse(fs.readFileSync(url, 'utf8'));
}

const layouts = {
  left: loadLayout('../config/left.json'),
  right: loadLayout('../config/right.json')
};

function buildSide(layout, frameId) {
  const sections = {};
  for (const run of layout.runs) {
    for (const section of run.sections) {
      const { id, led_count } = section;
      const buffer = Buffer.alloc(led_count * 3);
      for (let i = 0; i < led_count; i += 1) {
        buffer[i * 3] = frameId % 256;
      }
      sections[id] = { rgb_b64: buffer.toString('base64') };
    }
  }
  return sections;
}

const fps = parseFramesPerSecond();
const intervalMs = 1000 / fps;
let frameId = 0;

setInterval(() => {
  const frame = {
    ts: Math.floor(Date.now() / 1000),
    frame: frameId,
    fps,
    format: 'rgb8',
    sides: {
      left: buildSide(layouts.left, frameId),
      right: buildSide(layouts.right, frameId)
    }
  };
  process.stdout.write(`${JSON.stringify(frame)}\n`);
  frameId += 1;
}, intervalMs);
