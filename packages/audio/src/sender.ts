/**
 * WebSocket Sender Module
 *
 * Connects to the renderer WebSocket server and sends audio features.
 * Handles reconnection with exponential backoff.
 */

import WebSocket from 'ws';
import { AudioFeatures } from './features.js';

/** WebSocket sender configuration */
export interface SenderConfig {
  /** WebSocket server URL */
  url: string;
  /** Target send rate in Hz */
  sendRate: number;
  /** Initial reconnection delay in ms */
  reconnectDelay: number;
  /** Maximum reconnection delay in ms */
  maxReconnectDelay: number;
  /** Reconnection backoff multiplier */
  backoffMultiplier: number;
}

const DEFAULT_CONFIG: SenderConfig = {
  url: 'ws://localhost:8080',
  sendRate: 60, // 60Hz to match frame rate
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  backoffMultiplier: 1.5,
};

/** Message format sent to renderer */
export interface AudioMessage {
  type: 'audio';
  rms: number;
  bass: number;
  mids: number;
  highs: number;
  beat: boolean;
}

/**
 * WebSocket sender class for transmitting audio features to the renderer.
 *
 * Features:
 * - Rate-limited sending at configurable Hz
 * - Automatic reconnection with exponential backoff
 * - Graceful shutdown
 *
 * Usage:
 * ```typescript
 * const sender = new AudioSender();
 * sender.connect();
 * sender.send(features);
 * ```
 */
export class AudioSender {
  private config: SenderConfig;
  private ws: WebSocket | null = null;
  private isConnected = false;
  private shouldReconnect = true;
  private currentReconnectDelay: number;

  // Rate limiting
  private lastSendTime = 0;
  private minSendInterval: number;

  // Pending features to send (only latest is kept)
  private pendingFeatures: AudioFeatures | null = null;
  private sendTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<SenderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentReconnectDelay = this.config.reconnectDelay;
    this.minSendInterval = 1000 / this.config.sendRate;
  }

  /**
   * Connect to the WebSocket server.
   */
  connect(): void {
    if (this.ws) {
      return;
    }

    this.shouldReconnect = true;
    this.attemptConnection();
  }

  /**
   * Attempt to establish WebSocket connection.
   */
  private attemptConnection(): void {
    console.log(`[audio] Connecting to ${this.config.url}...`);

    try {
      this.ws = new WebSocket(this.config.url);

      this.ws.on('open', () => {
        console.log('[audio] Connected to renderer WebSocket');
        this.isConnected = true;
        this.currentReconnectDelay = this.config.reconnectDelay;
        this.startSendLoop();
      });

      this.ws.on('close', () => {
        console.log('[audio] WebSocket connection closed');
        this.handleDisconnect();
      });

      this.ws.on('error', (err) => {
        // Only log if not a connection refused error (common during reconnect)
        if (!err.message.includes('ECONNREFUSED')) {
          console.error('[audio] WebSocket error:', err.message);
        }
      });

      // Handle incoming messages (for future bidirectional communication)
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          // Could handle renderer responses here if needed
          if (msg.type === 'audio-ack') {
            // Acknowledgment from renderer
          }
        } catch {
          // Ignore parse errors
        }
      });
    } catch (err) {
      console.error('[audio] Failed to create WebSocket:', err);
      this.handleDisconnect();
    }
  }

  /**
   * Handle disconnection and schedule reconnect.
   */
  private handleDisconnect(): void {
    this.isConnected = false;
    this.stopSendLoop();
    this.ws = null;

    if (this.shouldReconnect) {
      console.log(
        `[audio] Reconnecting in ${this.currentReconnectDelay}ms...`
      );
      setTimeout(() => {
        if (this.shouldReconnect) {
          this.attemptConnection();
        }
      }, this.currentReconnectDelay);

      // Exponential backoff
      this.currentReconnectDelay = Math.min(
        this.currentReconnectDelay * this.config.backoffMultiplier,
        this.config.maxReconnectDelay
      );
    }
  }

  /**
   * Start the send loop that transmits features at the configured rate.
   */
  private startSendLoop(): void {
    if (this.sendTimer) {
      return;
    }

    this.sendTimer = setInterval(() => {
      this.flushPendingFeatures();
    }, this.minSendInterval);
  }

  /**
   * Stop the send loop.
   */
  private stopSendLoop(): void {
    if (this.sendTimer) {
      clearInterval(this.sendTimer);
      this.sendTimer = null;
    }
  }

  /**
   * Send the most recent pending features.
   */
  private flushPendingFeatures(): void {
    if (!this.pendingFeatures || !this.isConnected || !this.ws) {
      return;
    }

    const features = this.pendingFeatures;
    this.pendingFeatures = null;

    const message: AudioMessage = {
      type: 'audio',
      rms: features.rms,
      bass: features.bass,
      mids: features.mids,
      highs: features.highs,
      beat: features.beat,
    };

    try {
      this.ws.send(JSON.stringify(message));
      this.lastSendTime = Date.now();
    } catch (err) {
      console.error('[audio] Failed to send features:', err);
    }
  }

  /**
   * Queue features to be sent at the next send interval.
   * Only the most recent features are kept (older ones are dropped).
   *
   * @param features - Audio features to send
   */
  send(features: AudioFeatures): void {
    this.pendingFeatures = features;
  }

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.stopSendLoop();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }

    this.isConnected = false;
    console.log('[audio] Disconnected');
  }

  /**
   * Check if currently connected.
   */
  get connected(): boolean {
    return this.isConnected;
  }
}
