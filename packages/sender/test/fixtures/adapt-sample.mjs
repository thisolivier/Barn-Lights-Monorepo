import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create a temporary NDJSON sample file whose frame data matches the
 * LED counts defined in the given layout. Sections in the sample that
 * have more or fewer bytes than expected are truncated or padded with
 * zeros so that assembler logic can process them against the current
 * configuration.
 * @param {string} layoutPath - Path to the side layout JSON file.
 * @param {string} [samplePath] - Optional path to the renderer sample NDJSON.
 * @returns {string} Path to the adapted temporary sample file.
 */
export function createAdaptedSampleFile(
  layoutPath,
  samplePath = path.join(__dirname, '..', '..', 'config', 'input-sample.txt'),
) {
  const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
  const rawLines = fs.readFileSync(samplePath, 'utf8').trim().split('\n');
  const adaptedLines = rawLines.map((line) => adaptLine(line, layout));
  const tempPath = path.join(
    os.tmpdir(),
    `adapted-sample-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
  );
  fs.writeFileSync(tempPath, adaptedLines.join('\n'));
  return tempPath;
}

function adaptLine(line, layout) {
  const frame = JSON.parse(line);
  const sideFrame = frame.sides[layout.side];
  for (const runConfig of layout.runs) {
    for (const sectionConfig of runConfig.sections) {
      let sectionFrame = sideFrame[sectionConfig.id];
      const expectedBytes = sectionConfig.led_count * 3;
      if (!sectionFrame) {
        const zeroBuffer = Buffer.alloc(expectedBytes);
        sectionFrame = {
          length: sectionConfig.led_count,
          rgb_b64: zeroBuffer.toString('base64'),
        };
        sideFrame[sectionConfig.id] = sectionFrame;
        continue;
      }
      const rgbBuffer = Buffer.from(sectionFrame.rgb_b64, 'base64');
      if (rgbBuffer.length !== expectedBytes) {
        const adjustedBuffer = Buffer.alloc(expectedBytes);
        rgbBuffer.copy(
          adjustedBuffer,
          0,
          0,
          Math.min(expectedBytes, rgbBuffer.length),
        );
        sectionFrame.rgb_b64 = adjustedBuffer.toString('base64');
        sectionFrame.length = expectedBytes;
      }
    }
  }
  return JSON.stringify(frame);
}
