# Mailbox

Provides single-slot storage for assembled frames per side.
The assembler writes completed frames for the left and right sides
and the UDP sender retrieves them when ready to transmit.

## Usage

```ts
import { Mailbox } from './mailbox';

const mailbox = new Mailbox();

// Assembler writes frames
mailbox.write('left', assembledFrame);

// UDP sender reads frames
const frame = mailbox.take('left');
```

## Lifecycle and Flow
1. `Assembler` decodes NDJSON input into `AssembledFrame` objects.
2. After a side is built, it calls `mailbox.write(side, frame)` which overwrites any
   previously stored frame for that side.
3. `UdpSender` continuously polls `mailbox.take(side)`; when a frame is present it is
   removed from the mailbox and sent over the network.

## Concurrency Guarantees
- Each side has a single storage slot.
- `write` overwrites the slot atomically. If a frame was present and not yet read,
  `frames_dropped_overwrite` is incremented.
- `take` retrieves and clears the slot atomically. If a frame was read,
  `frames_sent` is incremented.
- No locking is required as Node.js runs JavaScript in a single thread, ensuring
  that `write` and `take` operations complete without interruption.
