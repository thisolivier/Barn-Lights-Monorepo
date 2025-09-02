import dgram from 'dgram';

/**
 * UdpSender polls the mailbox for assembled frames and sends them via UDP.
 */
export class UdpSender {
  /**
   * @param {object} runtimeConfig - Loaded sender configuration
   * @param {Mailbox} mailbox - Mailbox instance for retrieving frames
   * @param {Telemetry} [telemetry] - Telemetry instance for recording errors
   * @param {{error:Function, warn:Function, info:Function, debug:Function}} [logger=console]
   */
  constructor(runtimeConfig, mailbox, telemetry, logger = console) {
    this.config = runtimeConfig;
    this.mailbox = mailbox;
    this.telemetry = telemetry;
    this.logger = logger;
    this.sockets = {};
    this.timers = {};
  }

  /** Start polling loops for all configured sides. */
  start() {
    const sides = this.config.sides || {};
    for (const [sideName, sideConfig] of Object.entries(sides)) {
      const socket = dgram.createSocket('udp4');
      this.sockets[sideName] = socket;
      this.timers[sideName] = setInterval(
        () => this.#sendAvailable(sideName, sideConfig, socket),
        1,
      );
    }
  }

  /** Stop all loops and close sockets. */
  stop() {
    for (const timer of Object.values(this.timers)) {
      clearInterval(timer);
    }
    for (const socket of Object.values(this.sockets)) {
      socket.close();
    }
  }

  /**
   * Send a single reboot signal to the controller for the given side.
   * @param {"left"|"right"} sideName
   */
  sendRebootSignal(sideName) {
    const sideConfig = this.config.sides?.[sideName];
    const socket = this.sockets[sideName];
    if (!sideConfig || !socket) {
      return;
    }
    const rebootPort = sideConfig.portBase + 100;
    const message = Buffer.alloc(1);
    socket.send(message, rebootPort, sideConfig.ip, (err) => {
      if (err) {
        const msg = `UDP reboot send error for side ${sideName}: ${err.message}`;
        if (this.telemetry && typeof this.telemetry.recordError === 'function') {
          this.telemetry.recordError(msg);
        } else {
          this.logger.error(msg);
        }
      }
    });
  }

  /**
   * Check the mailbox for a frame and send packets for each run.
   * @param {"left"|"right"} sideName
   * @param {object} sideConfig
   * @param {import('dgram').Socket} socket
   */
  #sendAvailable(sideName, sideConfig, socket) {
    const frame = this.mailbox.take(sideName);
    if (!frame) {
      return;
    }
    for (const run of frame.runs) {
      const header = Buffer.alloc(4);
      header.writeUInt32BE(frame.frame_id >>> 0, 0);
      const packet = Buffer.concat([header, run.data]);
      socket.send(
        packet,
        sideConfig.portBase + run.run_index,
        sideConfig.ip,
        (err) => {
          if (err) {
            const msg = `UDP send error for side ${sideName}: ${err.message}`;
            if (this.telemetry && typeof this.telemetry.recordError === 'function') {
              this.telemetry.recordError(msg);
            } else {
              this.logger.error(msg);
            }
          }
        },
      );
    }
  }
}

export default UdpSender;
