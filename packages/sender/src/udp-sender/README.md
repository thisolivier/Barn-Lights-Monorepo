# UDP Sender

Fetches frames from the [Mailbox](../mailbox) and sends them to each side's
controller over UDP. One loop runs per side, polling the mailbox and emitting a
packet for each run within a frame.

## Usage

```js
import { Mailbox } from '../mailbox/index.ts';
import { UdpSender } from './index.mjs';

const mailbox = new Mailbox();
const sender = new UdpSender(runtimeConfig, mailbox);
sender.start();

// later when shutting down
sender.stop();
```

`UdpSender` calls `mailbox.take(side)` which atomically retrieves the latest
assembled frame. The mailbox updates telemetry counters (`frames_sent`) when
frames are consumed.
