const fs = require('fs');
const path = require('path');

/**
 * @typedef {{id: string, led_count: number}} SectionCfg
 * @typedef {{run_index: number, led_count: number, sections: SectionCfg[]}} RunCfg
 * @typedef {{side: string, total_leds: number, runs: RunCfg[]}} SideLayout
 */

/**
 * Load and validate a side layout JSON file.
 *
 * @param {string} filePath - Path to the JSON layout file.
 * @param {{warn: Function}} [logger=console] - Logger used for warnings.
 * @returns {SideLayout}
 */
function loadLayout(filePath, logger = console) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const layout = JSON.parse(raw);

  if (!layout || !Array.isArray(layout.runs)) {
    throw new Error('Layout must have a runs array');
  }

  const runIndices = new Set();
  let totalRunLeds = 0;

  for (const run of layout.runs) {
    if (runIndices.has(run.run_index)) {
      throw new Error(`Duplicate run_index ${run.run_index}`);
    }
    runIndices.add(run.run_index);

    const sectionSum = (run.sections || []).reduce((acc, s) => acc + s.led_count, 0);
    if (sectionSum !== run.led_count) {
      throw new Error(`run_index ${run.run_index} led_count ${run.led_count} does not match sections sum ${sectionSum}`);
    }
    totalRunLeds += run.led_count;
  }

  if (layout.total_leds !== totalRunLeds) {
    logger.warn(
      `Layout ${filePath} total_leds ${layout.total_leds} does not equal sum of runs ${totalRunLeds}`,
    );
  }

  return layout;
}

/**
 * Load left and right layouts from a directory.
 *
 * @param {string} dir - Directory containing left.json and right.json.
 * @param {{warn: Function}} [logger=console]
 * @returns {{left: SideLayout, right: SideLayout}}
 */
function loadLayouts(dir, logger = console) {
  return {
    left: loadLayout(path.join(dir, 'left.json'), logger),
    right: loadLayout(path.join(dir, 'right.json'), logger),
  };
}

module.exports = { loadLayout, loadLayouts };
