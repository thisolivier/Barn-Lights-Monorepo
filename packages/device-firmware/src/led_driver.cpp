#include "led_driver.h"
#include "config_autogen.h"
#include "hal/hal.h"

static const int NUM_STRIPS = 8;

static uint32_t startup_time_ms = 0;
static const uint32_t STARTUP_BLACKOUT_MS = 1000;

void driver_init() {
    hal::leds_init(MAX_LEDS);
    startup_time_ms = hal::millis();

    // Set all LEDs to black initially
    driver_show_black();
}

void driver_show_frame(const uint8_t* frame_data) {
    // Frame data is RGB, need to copy to LED buffer
    // Frame layout: run0 data, run1 data, run2 data, ...
    // Each run has LED_COUNT[run] * 3 bytes (RGB)

    const uint8_t* src = frame_data;

    for (int run = 0; run < RUN_COUNT; run++) {
        int led_count = LED_COUNT[run];

        for (int i = 0; i < led_count; i++) {
            uint8_t r = *src++;
            uint8_t g = *src++;
            uint8_t b = *src++;

            hal::leds_set_pixel(run, i, r, g, b);
        }

        // Clear any remaining LEDs in this strip (beyond LED_COUNT[run])
        for (int i = led_count; i < MAX_LEDS; i++) {
            hal::leds_set_pixel(run, i, 0, 0, 0);
        }
    }

    // Clear unused strips
    for (int run = RUN_COUNT; run < NUM_STRIPS; run++) {
        for (int i = 0; i < MAX_LEDS; i++) {
            hal::leds_set_pixel(run, i, 0, 0, 0);
        }
    }

    hal::leds_show();
}

void driver_show_black() {
    for (int strip = 0; strip < NUM_STRIPS; strip++) {
        for (int i = 0; i < MAX_LEDS; i++) {
            hal::leds_set_pixel(strip, i, 0, 0, 0);
        }
    }
    hal::leds_show();
}

bool driver_is_busy() {
    return hal::leds_busy();
}

bool driver_ready_for_frames() {
    return (hal::millis() - startup_time_ms) >= STARTUP_BLACKOUT_MS;
}
