import { EventEmitter } from 'events';

/**
 * Assembler listens for NDJSON frame events and builds per-run RGB buffers.
 * It decodes base64-encoded section data into Uint8Array buffers and
 * emits a FrameAssembled event for each side that assembles successfully.
 */
export class Assembler extends EventEmitter {
  /**
   * @param {object} runtimeConfig - Loaded sender configuration containing side layouts.
   * @param {{error:Function, warn:Function, info:Function, debug:Function}} [logger=console] - Logger for diagnostics.
   * @param {object} [mailbox] - Optional mailbox for assembled frames.
   */
  constructor(runtimeConfig, logger = console, mailbox = null) {
    super();
    this.config = runtimeConfig;
    this.logger = logger;
    this.mailbox = mailbox;

    const sides = this.config.sides || {};
    for (const [sideName, sideCfg] of Object.entries(sides)) {
      if (!Array.isArray(sideCfg.runs)) {
        throw new Error(`Side ${sideName} configuration missing runs array`);
      }
    }
  }

  /**
   * Bind to an EventEmitter that emits FrameIngest events with NDJSON frames.
   * @param {EventEmitter} frameEmitter
   */
  bindFrameEmitter(frameEmitter) {
    frameEmitter.on('FrameIngest', (ndjsonFrame) => {
      this.#handleFrame(ndjsonFrame);
    });
  }

  /**
   * Handle a single NDJSON frame and emit assembled buffers.
   * @param {object} ndjsonFrame
   */
  #handleFrame(ndjsonFrame) {
    const sides = this.config.sides || {};
    for (const [sideName, sideConfig] of Object.entries(sides)) {
      if (!sideConfig) {
        continue;
      }
      const frameSides = ndjsonFrame.sides || {};
      const frameSide = frameSides[sideName];
      if (!frameSide) {
        continue;
      }

      const runBuffers = [];
      let sideIsValid = true;

      for (const runConfig of sideConfig.runs) {
        const runBuffer = new Uint8Array(runConfig.led_count * 3);
        let bufferOffset = 0;

        for (const sectionConfig of runConfig.sections) {
          const sectionFrame = frameSide[sectionConfig.id];
          if (!sectionFrame) {
            this.logger.error(`Missing section ${sectionConfig.id} for side ${sideName}`);
            sideIsValid = false;
            break;
          }

          const decodedSection = Buffer.from(sectionFrame.rgb_b64, 'base64');
          const expectedBytes = sectionConfig.led_count * 3;
          if (decodedSection.length !== expectedBytes) {
            this.logger.error(
              `Section ${sectionConfig.id} length mismatch for side ${sideName}`,
            );
            sideIsValid = false;
            break;
          }

          const startX =
            typeof sectionConfig.x0 === 'number'
              ? sectionConfig.x0
              : sectionConfig.x1;
          const endX = sectionConfig.x1;
          const needsFlip =
            typeof startX === 'number' &&
            typeof endX === 'number' &&
            endX < startX;

          if (needsFlip) {
            const flipped = new Uint8Array(expectedBytes);
            for (
              let source = 0, dest = expectedBytes - 3;
              source < expectedBytes;
              source += 3, dest -= 3
            ) {
              flipped.set(decodedSection.subarray(source, source + 3), dest);
            }
            runBuffer.set(flipped, bufferOffset);
          } else {
            runBuffer.set(decodedSection, bufferOffset);
          }
          bufferOffset += expectedBytes;
        }

        if (!sideIsValid) {
          break;
        }

        runBuffers.push({ run_index: runConfig.run_index, data: runBuffer });
      }

      if (sideIsValid) {
        const assembled = {
          side: sideConfig.side || sideName,
          frame_id: ndjsonFrame.frame >>> 0,
          runs: runBuffers,
        };
        this.emit('FrameAssembled', assembled);
        if (this.mailbox) {
          this.mailbox.write(sideConfig.side || sideName, assembled);
        }
      }
    }
  }
}

export default Assembler;
