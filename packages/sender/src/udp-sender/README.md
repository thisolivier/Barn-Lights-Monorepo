# UDP Sender

Fetches frames from the [Mailbox](../mailbox) and sends them to each side's
controller over UDP. One loop runs per side, polling the mailbox and emitting a
packet for each run within a frame.

The sender exposes `sendRebootSignal(side)` for emitting a single byte to
`portBase + 100` when a renderer requests a controller reboot.

## Usage

```js
import { Mailbox } from '../mailbox/index.ts';
import { Telemetry } from '../telemetry/index.mjs';
import { UdpSender } from './index.mjs';

const mailbox = new Mailbox();
const telemetry = new Telemetry(runtimeConfig, mailbox);
const sender = new UdpSender(runtimeConfig, mailbox, telemetry);
sender.start();

// later when shutting down
sender.stop();
```

`UdpSender` calls `mailbox.take(side)` which atomically retrieves the latest
assembled frame. The mailbox updates telemetry counters (`frames_sent`) when
frames are consumed. When UDP send errors occur they are passed to the telemetry
instance which aggregates and prints them below each report.
