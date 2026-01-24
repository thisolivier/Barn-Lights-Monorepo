/**
 * Device state aggregator for tracking heartbeats and computing health metrics.
 * Tracks devices by their ID (e.g., "LEFT", "RIGHT") and computes derived
 * metrics like packet loss and time since last heartbeat.
 */
export class Aggregator {
  #devices = new Map();
  #heartbeatTimeout;

  /**
   * Create a new Aggregator
   * @param {object} options - Configuration options
   * @param {number} [options.heartbeatTimeout=5000] - Time in ms before device is considered offline
   */
  constructor({ heartbeatTimeout = 5000 } = {}) {
    this.#heartbeatTimeout = heartbeatTimeout;
  }

  /**
   * Update device state with a new heartbeat
   * @param {object} heartbeat - Heartbeat data from device
   * @param {string} heartbeat.id - Device identifier (e.g., "LEFT", "RIGHT")
   * @param {number} [heartbeat.seq] - Sequence number for packet loss tracking
   * @param {number} [heartbeat.uptime] - Device uptime in milliseconds
   * @param {number} [heartbeat.freeHeap] - Free heap memory in bytes
   * @param {object} [heartbeat.stats] - Additional device statistics
   */
  updateDevice(heartbeat) {
    const { id, seq, ...rest } = heartbeat;

    if (!id) {
      throw new Error('Heartbeat must include device id');
    }

    const now = Date.now();
    const existing = this.#devices.get(id);

    // Calculate packet loss if we have sequence numbers
    let packetLoss = 0;
    let expectedPackets = 0;
    let receivedPackets = 0;

    if (existing && seq !== undefined && existing.lastSeq !== undefined) {
      const seqDiff = seq - existing.lastSeq;
      if (seqDiff > 0) {
        // Normal case: sequence increased
        expectedPackets = existing.expectedPackets + seqDiff;
        receivedPackets = existing.receivedPackets + 1;
      } else if (seqDiff < 0) {
        // Sequence wrapped or device restarted - reset counters
        expectedPackets = 1;
        receivedPackets = 1;
      } else {
        // Same sequence number (duplicate)
        expectedPackets = existing.expectedPackets;
        receivedPackets = existing.receivedPackets;
      }
    } else if (seq !== undefined) {
      // First heartbeat with sequence
      expectedPackets = 1;
      receivedPackets = 1;
    }

    if (expectedPackets > 0) {
      packetLoss = Math.max(0, ((expectedPackets - receivedPackets) / expectedPackets) * 100);
    }

    const deviceState = {
      id,
      lastHeartbeat: now,
      lastSeq: seq,
      expectedPackets,
      receivedPackets,
      packetLoss,
      firstSeen: existing?.firstSeen ?? now,
      heartbeatCount: (existing?.heartbeatCount ?? 0) + 1,
      ...rest
    };

    this.#devices.set(id, deviceState);
    return deviceState;
  }

  /**
   * Get device state by ID
   * @param {string} id - Device identifier
   * @returns {object|undefined} Device state or undefined if not found
   */
  getDevice(id) {
    const device = this.#devices.get(id);
    if (!device) return undefined;

    return this.#enrichDeviceState(device);
  }

  /**
   * Get all device states
   * @returns {object[]} Array of device states
   */
  getAllDevices() {
    return Array.from(this.#devices.values()).map(device =>
      this.#enrichDeviceState(device)
    );
  }

  /**
   * Enrich device state with computed metrics
   * @param {object} device - Raw device state
   * @returns {object} Device state with computed metrics
   */
  #enrichDeviceState(device) {
    const now = Date.now();
    const timeSinceLastHeartbeat = now - device.lastHeartbeat;
    const online = timeSinceLastHeartbeat < this.#heartbeatTimeout;

    return {
      ...device,
      timeSinceLastHeartbeat,
      online,
      status: online ? 'online' : 'offline'
    };
  }

  /**
   * Get overall system health based on device states
   * @returns {object} System health summary
   */
  getSystemHealth() {
    const devices = this.getAllDevices();
    const totalDevices = devices.length;
    const onlineDevices = devices.filter(d => d.online).length;
    const offlineDevices = totalDevices - onlineDevices;

    // Calculate average packet loss across all devices
    const devicesWithPacketLoss = devices.filter(d => d.expectedPackets > 0);
    const avgPacketLoss = devicesWithPacketLoss.length > 0
      ? devicesWithPacketLoss.reduce((sum, d) => sum + d.packetLoss, 0) / devicesWithPacketLoss.length
      : 0;

    // Determine overall status
    let status;
    if (totalDevices === 0) {
      status = 'unknown';
    } else if (offlineDevices === 0 && avgPacketLoss < 5) {
      status = 'healthy';
    } else if (onlineDevices > 0 && avgPacketLoss < 20) {
      status = 'degraded';
    } else {
      status = 'critical';
    }

    return {
      status,
      totalDevices,
      onlineDevices,
      offlineDevices,
      avgPacketLoss: Math.round(avgPacketLoss * 100) / 100,
      devices: devices.map(d => ({
        id: d.id,
        status: d.status,
        packetLoss: Math.round(d.packetLoss * 100) / 100
      }))
    };
  }

  /**
   * Clear all device state
   */
  clear() {
    this.#devices.clear();
  }

  /**
   * Get the number of tracked devices
   * @returns {number}
   */
  get deviceCount() {
    return this.#devices.size;
  }
}

/**
 * Create a new Aggregator instance
 * @param {object} options - Configuration options
 * @returns {Aggregator}
 */
export function createAggregator(options = {}) {
  return new Aggregator(options);
}
