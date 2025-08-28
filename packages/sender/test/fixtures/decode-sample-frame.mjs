import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Decode the first frame from the renderer sample and assemble the
 * expected RGB buffer for the first run of the left side.
 * @param {string} layoutPath - Path to the layout JSON file for the side.
 * @param {string} samplePath - Optional path to the renderer sample input.
 * @returns {{frameId:number, buffer:Buffer}}
 */
export function decodeSampleFrame(layoutPath, samplePath = path.join(__dirname, '..', '..', 'config', 'input-sample.txt')) {
  const ndjsonLine = fs.readFileSync(samplePath, 'utf8').split('\n')[0];
  const frame = JSON.parse(ndjsonLine);
  const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
  const runConfig = layout.runs[0];
  const frameSide = frame.sides.left;
  const buffer = Buffer.alloc(runConfig.led_count * 3);
  let offset = 0;
  for (const section of runConfig.sections) {
    const sectionFrame = frameSide[section.id];
    const decoded = Buffer.from(sectionFrame.rgb_b64, 'base64');
    buffer.set(decoded, offset);
    offset += decoded.length;
  }
  return { frameId: frame.frame >>> 0, buffer };
}
