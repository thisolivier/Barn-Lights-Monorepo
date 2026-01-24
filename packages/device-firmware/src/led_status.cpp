#include "led_status.h"
#include "hal/hal.h"

static const uint32_t SLOW_BLINK_INTERVAL_MS = 500;

static bool first_frame_received = false;
static uint32_t frame_count = 0;
static uint32_t last_blink_ms = 0;
static bool led_state = false;

void led_status_init() {
    hal::status_led_init();
    hal::status_led_set(false);

    // Reset all state
    first_frame_received = false;
    frame_count = 0;
    last_blink_ms = hal::millis();
    led_state = false;
}

void led_status_poll() {
    uint32_t now = hal::millis();

    if (!first_frame_received) {
        // Slow blink until first frame
        if (now - last_blink_ms >= SLOW_BLINK_INTERVAL_MS) {
            last_blink_ms = now;
            led_state = !led_state;
            hal::status_led_set(led_state);
        }
    }
    // After first frame, LED is controlled by led_status_frame_displayed()
}

void led_status_frame_displayed() {
    if (!first_frame_received) {
        first_frame_received = true;
        hal::status_led_set(false);
    }

    frame_count++;

    // Quick tick every 60th frame for first 600 frames
    if (frame_count <= 600 && (frame_count % 60) == 0) {
        // Brief flash
        hal::status_led_set(true);
        hal::delay_us(1000);  // 1ms flash
        hal::status_led_set(false);
    }
}
