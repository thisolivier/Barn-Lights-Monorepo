#include "config_autogen.h"
#include "hal/hal.h"
#include "led_driver.h"
#include "network.h"
#include "receiver.h"
#include "status.h"
#include "led_status.h"
#include "wakeup.h"
#include <cstdio>

extern "C" void setup() {
    // Initialize serial for debugging (optional)
    hal::serial_init(115200);

    // Initialize LED driver first (sets LEDs black)
    driver_init();

    // Initialize wakeup effect (runs during startup)
    wakeup_init();

    // Initialize receiver frame assembly
    receiver_init();

    // Initialize network (Ethernet + UDP sockets)
    network_init();

    // Initialize status heartbeat
    status_init();

    // Initialize onboard LED indicator
    led_status_init();

    char buf[64];
    hal::serial_println("Teensy LED Controller initialized");
    snprintf(buf, sizeof(buf), "Side: %s", SIDE_ID);
    hal::serial_println(buf);
    snprintf(buf, sizeof(buf), "Runs: %d", RUN_COUNT);
    hal::serial_println(buf);
    snprintf(buf, sizeof(buf), "IP: %s", network_get_ip_string());
    hal::serial_println(buf);
}

extern "C" void loop() {
    // Run wakeup effect until complete
    if (!wakeup_is_complete()) {
        wakeup_poll();
        return;
    }

    // Poll network for incoming UDP packets
    network_poll();

    // Check if we have a complete frame ready
    if (driver_ready_for_frames()) {
        const uint8_t* frame = receiver_get_complete_frame();
        if (frame != nullptr && !driver_is_busy()) {
            driver_show_frame(frame);
            led_status_frame_displayed();
        }
    }

    // Send heartbeat if interval elapsed
    status_poll();

    // Update onboard LED status
    led_status_poll();
}
