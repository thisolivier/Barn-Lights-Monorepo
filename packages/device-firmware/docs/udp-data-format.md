# UDP Data Format

Each run within a frame is transmitted as a UDP datagram. The destination IP and
base port (`portBase`) are configured per side; the sender transmits each run to
`portBase + run_index`.

## Payload Layout

```
Offset  Size  Description
0       2     session_id (unsigned 16-bit big-endian)
2       4     frame_id (unsigned 32-bit big-endian)
6       N     RGB data for the run (run_led_count * 3 bytes)
```

- `session_id` is randomly generated as an unsigned 16-bit value when the sender
  process starts and remains constant until the process shuts down. Firmware can
  use this value to detect when the sender has restarted and reset any
  per-session state.
- `frame_id` matches the `frame` value emitted by the renderer (u32, wrapping at
  2^32).
- The RGB bytes are ordered physically with one byte each for red, green, and
  blue per LED.