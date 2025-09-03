# Main

Application entry point and task startup. `app_main.c` creates FreeRTOS tasks for networking, UDP frame reception, driver control, and status reporting.

- `net_task.c` initialises Ethernet and raises `NETWORK_READY_BIT` once the interface is ready.
- `rx_task.c` opens UDP sockets on `PORT_BASE + run_index` and assembles frame buffers keyed by `frame_id` (keeping only the current and next frames).
- `driver_task.c` configures one RMT channel per run. It supports up to four runs of 400 LEDs each. On boot it waits one second, then flashes the first few pixels of each run for one second before frame display begins.
- `status_task.c` sends a heartbeat JSON every second to `SENDER_IP:STATUS_PORT`, reporting counters since the previous heartbeat.
- `control_task.c` listens on `PORT_BASE + 100` for UDP packets and invokes `esp_restart()` when one is received, enabling remote reboot.

Unit tests reside in `test/test_net_task.c` with `test/CMakeLists.txt` wiring them into the ESP-IDF `idf.py test` workflow.
