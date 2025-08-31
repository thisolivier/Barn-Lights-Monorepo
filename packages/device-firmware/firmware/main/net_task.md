# Network Task

Initialises the ESP32 Ethernet interface using a LAN87xx series PHY. The task configures the RMII pins via `smi_gpio`, installs the EMAC driver and assigns a static IP address using values generated in `config_autogen.h`.

If driver installation fails, the task logs the error, frees any partially initialised resources and exits without setting `NETWORK_READY_BIT`, allowing the system to continue running without networking.

Once the interface is started, the task sets `NETWORK_READY_BIT` on its event group to signal that the network stack is ready for use.

Compile-time assertions validate the presence and range of the IP configuration macros and RMII pin selections. Builds will fail if the configuration is missing or out of range, catching misconfiguration early.
