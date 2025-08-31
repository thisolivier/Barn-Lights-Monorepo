# Main

Application entry point and task startup. `app_main.c` creates FreeRTOS tasks for networking, UDP frame reception, driver control, and status reporting.

- `net_task.c` initialises Ethernet and raises `NETWORK_READY_BIT` once the interface is ready.
- `rx_task.c` opens UDP sockets on `PORT_BASE + run_index`, validates packet length, and assembles frame buffers keyed by `frame_id`, keeping only the current and next frames.
- `driver_task.c` configures one RMT channel per run using the modern `rmt_tx` API and triggers them simultaneously. On boot it waits one second, flashes each run for one second with RGB 218,170,52 in sequence, then begins displaying frames, swapping buffers when a new frame arrives and converting RGB bytes to GRB during encoding. Compile-time checks verify RMT timing.
- `status_task.c` sends a heartbeat JSON every second to `SENDER_IP:STATUS_PORT`, reporting counters since the previous heartbeat.

Unit tests reside in `test/test_net_task.c` with `test/CMakeLists.txt` wiring them into the ESP-IDF `idf.py test` workflow.
