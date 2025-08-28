# Main

Application entry point and task startup. `app_main.c` creates FreeRTOS tasks for networking, UDP frame reception, driver control, and status reporting.

- `net_task.c` initialises Ethernet and raises `NETWORK_READY_BIT` once the interface is ready.
- `rx_task.c` opens UDP sockets on `PORT_BASE + run_index`, validates packet length, converts RGB bytes to GRB, and assembles frame buffers keyed by `frame_id`, keeping only the current and next frames.
