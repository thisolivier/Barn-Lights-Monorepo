export interface AssembledFrame {
  side: string;
  frame_id: number;
  runs: { run_index: number; data: Uint8Array }[];
}

type Side = 'left' | 'right';

interface Slot {
  frame?: AssembledFrame;
  frames_dropped_overwrite: number;
  frames_sent: number;
}

/**
 * Mailbox provides single-slot storage for assembled frames per side.
 * Writers overwrite any existing frame while readers atomically take and clear.
 */
export class Mailbox {
  private slots: Record<Side, Slot>;

  constructor() {
    this.slots = {
      left: { frames_dropped_overwrite: 0, frames_sent: 0 },
      right: { frames_dropped_overwrite: 0, frames_sent: 0 },
    };
  }

  /** Store the latest frame for a side, overwriting any existing frame. */
  write(side: Side, frame: AssembledFrame): void {
    const slot = this.slots[side];
    if (slot.frame) {
      slot.frames_dropped_overwrite += 1;
    }
    slot.frame = frame;
  }

  /** Atomically take and clear the stored frame for a side. */
  take(side: Side): AssembledFrame | undefined {
    const slot = this.slots[side];
    const frame = slot.frame;
    if (frame) {
      slot.frames_sent += 1;
      slot.frame = undefined;
    }
    return frame;
  }

  /** Retrieve telemetry counters for a side. */
  stats(side: Side): { frames_dropped_overwrite: number; frames_sent: number } {
    const { frames_dropped_overwrite, frames_sent } = this.slots[side];
    return { frames_dropped_overwrite, frames_sent };
  }
}
