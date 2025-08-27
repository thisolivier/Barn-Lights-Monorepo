// JavaScript implementation of the Mailbox originally defined in index.ts

export class Mailbox {
  constructor() {
    this.slots = {
      left: { frames_dropped_overwrite: 0, frames_sent: 0 },
      right: { frames_dropped_overwrite: 0, frames_sent: 0 },
    };
  }

  write(side, frame) {
    const slot = this.slots[side];
    if (slot.frame) {
      slot.frames_dropped_overwrite += 1;
    }
    slot.frame = frame;
  }

  take(side) {
    const slot = this.slots[side];
    const frame = slot.frame;
    if (frame) {
      slot.frames_sent += 1;
      slot.frame = undefined;
    }
    return frame;
  }

  stats(side) {
    const { frames_dropped_overwrite, frames_sent } = this.slots[side];
    return { frames_dropped_overwrite, frames_sent };
  }
}

export default Mailbox;

