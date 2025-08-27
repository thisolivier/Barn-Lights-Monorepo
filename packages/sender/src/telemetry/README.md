# Telemetry

The telemetry module gathers runtime statistics from the renderer, assembler and UDP sender.  It listens for events to count frames and periodically prints a summary table.

## Usage

```javascript
import { Telemetry } from './telemetry/index.mjs';

const telemetry = new Telemetry(config, mailbox, logger);
telemetry.bindRenderer(rendererProcess);
telemetry.bindAssembler(assembler);
telemetry.start();
```

Call `stop()` during shutdown to flush the final report.

## Counters

Per side counters maintained and reported:

- `frames_ingested` – frames received from the renderer.
- `frames_built` – frames successfully assembled.
- `frames_sent` – frames taken from the mailbox.
- `frames_dropped_build` – frames dropped during assembly.
- `frames_dropped_overwrite` – frames overwritten in the mailbox.
- `pps` – packets per second sent during the last interval.
- `bytes_per_sec` – UDP payload bytes per second.
- `last_frame_id` – identifier of the last assembled frame.
- `last_send_ts` – timestamp when packets were last sent.

The module also tracks per-run totals for packets and bytes sent across the lifetime of the process.
