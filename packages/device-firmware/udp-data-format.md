# UDP Data Format

Each frame is broken into runs and transmitted to the controllers as UDP datagrams. For a given side the destination IP is specified in sender.config.json and each run is sent to portBase + run_index.

The UDP payload layout is:

| Offset |  Size |  Description |
|--------|-------|--------------|
| 0      | 4     | frame_id (unsigned 32-bit big-endian)|
| 4      | N     | RGB data for the run (run_led_count * 3 bytes)|

RGB bytes are in physical LED order with one 8-bit value for each of red, green and blue.

The frame_id matches the frame value emitted by the renderer and wraps at 2^32.

Controllers should only display a frame after receiving all runs for a side with the same frame_id; otherwise the last complete frame should remain visible.