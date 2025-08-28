# Main

Application entry point and task startup. `app_main.c` creates FreeRTOS tasks for networking, message reception, driver control, and status reporting. The networking task is implemented in `net_task.c` and raises `NETWORK_READY_BIT` once the Ethernet interface is initialised.
