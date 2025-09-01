import { EventEmitter } from 'events';

/**
 * Telemetry collects statistics about frames and UDP packet throughput.
 */
export class Telemetry {
  /**
   * @param {object} runtimeConfig - Loaded sender configuration
   * @param {Mailbox} mailbox - Shared mailbox instance
   * @param {{error:Function, warn:Function, info:Function, debug:Function}} [logger=console]
   */
  constructor(runtimeConfig, mailbox, logger = console) {
    this.config = runtimeConfig;
    this.mailbox = mailbox;
    this.logger = logger;
    this.intervalHandle = null;
    this.sides = {};
    this.errorCounts = new Map();

    const sides = runtimeConfig.sides || {};
    for (const [sideName, sideConfig] of Object.entries(sides)) {
      const runPacketSizes = {};
      const runStats = {};
      for (const run of sideConfig.runs || []) {
        const bytesPerPacket = 4 + run.led_count * 3;
        runPacketSizes[run.run_index] = bytesPerPacket;
        runStats[run.run_index] = { packets: 0, bytes: 0 };
      }
      this.sides[sideName] = {
        frames_ingested: 0,
        frames_built: 0,
        frames_sent: 0,
        frames_dropped_build: 0,
        frames_dropped_overwrite: 0,
        pps: 0,
        bytes_per_sec: 0,
        last_frame_id: null,
        last_send_ts: null,
        runs: runStats,
        run_packet_sizes: runPacketSizes,
        prev_frames_sent: 0,
        last_build_warn: 0,
        last_overwrite_warn: 0,
      };
    }
  }

  /** Bind renderer process events. */
  bindRenderer(renderer) {
    if (!(renderer instanceof EventEmitter)) {
      return;
    }
    renderer.on('FrameIngest', (frame) => {
      const frameSides = frame.sides || {};
      for (const side of Object.keys(frameSides)) {
        if (this.sides[side]) {
          this.sides[side].frames_ingested += 1;
        }
      }
    });
  }

  /** Bind assembler events. */
  bindAssembler(assembler) {
    if (!(assembler instanceof EventEmitter)) {
      return;
    }
    assembler.on('FrameAssembled', (frame) => {
      const sideState = this.sides[frame.side];
      if (!sideState) {
        return;
      }
      sideState.frames_built += 1;
      sideState.last_frame_id = frame.frame_id;
    });
  }

  /**
   * Record an error message for throttled reporting.
   * @param {string|Error} err
   */
  recordError(err) {
    const message = typeof err === 'string' ? err : err?.message || String(err);
    const prev = this.errorCounts.get(message) || 0;
    this.errorCounts.set(message, prev + 1);
  }

  /** Start periodic telemetry output. */
  start() {
    if (this.intervalHandle) {
      return;
    }
    this.#report();
    const intervalMs = this.config.telemetry?.interval_ms || 1000;
    this.intervalHandle = setInterval(() => this.#report(), intervalMs);
  }

  /** Stop telemetry output and emit final report. */
  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.#report();
    console.log('');
  }

  /** Compute and print current statistics. */
  #report() {
    const now = Date.now();
    const intervalMs = this.config.telemetry?.interval_ms || 1000;
    const intervalSeconds = intervalMs / 1000;
    const header = ['side', 'ingested', 'built', 'sent', 'drop_build', 'drop_overwrite', 'pps', 'Bps', 'last_frame', 'last_send'];
    const rows = [];

    for (const [sideName, state] of Object.entries(this.sides)) {
      const stats = this.mailbox.stats(sideName);
      const deltaFramesSent = stats.frames_sent - state.prev_frames_sent;
      state.frames_sent = stats.frames_sent;
      state.frames_dropped_overwrite = stats.frames_dropped_overwrite;
      if (deltaFramesSent > 0) {
        state.last_send_ts = now;
      }
      let packets = 0;
      let bytes = 0;
      for (const [runIndex, packetBytes] of Object.entries(state.run_packet_sizes)) {
        const run = state.runs[runIndex];
        run.packets += deltaFramesSent;
        const bytesDelta = deltaFramesSent * packetBytes;
        run.bytes += bytesDelta;
        packets += deltaFramesSent;
        bytes += bytesDelta;
      }
      state.pps = packets / intervalSeconds;
      state.bytes_per_sec = bytes / intervalSeconds;
      state.frames_dropped_build = state.frames_ingested - state.frames_built;

      if (state.frames_dropped_build > 0 && now - state.last_build_warn > 5000) {
        this.logger.warn(
          `${sideName} dropped ${state.frames_dropped_build} frame(s) during build`,
        );
        state.last_build_warn = now;
      }
      if (state.frames_dropped_overwrite > 0 && now - state.last_overwrite_warn > 5000) {
        this.logger.warn(
          `${sideName} dropped ${state.frames_dropped_overwrite} frame(s) due to overwrite`,
        );
        state.last_overwrite_warn = now;
      }

      state.prev_frames_sent = stats.frames_sent;

      rows.push([
        sideName,
        state.frames_ingested,
        state.frames_built,
        state.frames_sent,
        state.frames_dropped_build,
        state.frames_dropped_overwrite,
        state.pps.toFixed(1),
        state.bytes_per_sec.toFixed(1),
        state.last_frame_id ?? '',
        state.last_send_ts ? new Date(state.last_send_ts).toISOString() : '',
      ]);
    }

    const widths = header.map((h, i) =>
      Math.max(h.length, ...rows.map((row) => String(row[i]).length)),
    );
    const line = (cols) =>
      cols
        .map((c, i) => String(c).padStart(widths[i]))
        .join(' ');
    console.log(line(header));
    for (const row of rows) {
      console.log(line(row));
    }

    if (this.errorCounts.size > 0) {
      for (const [msg, count] of this.errorCounts.entries()) {
        this.logger.error(`${msg} (${count}x)`);
      }
      this.errorCounts.clear();
    }
  }
}

export default Telemetry;
