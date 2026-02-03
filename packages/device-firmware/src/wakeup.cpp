#include "wakeup.h"
#include "config_autogen.h"
#include "hal/hal.h"

// Warm white at 50% brightness (RGB values chosen for warm tone)
static const uint8_t WARM_WHITE_RED = 128;
static const uint8_t WARM_WHITE_GREEN = 100;
static const uint8_t WARM_WHITE_BLUE = 64;

// Timing constants
static const uint32_t RUN_LIGHT_DURATION_MS = 200;
static const uint32_t GAP_BETWEEN_RUNS_MS = 50;

// State machine states
enum class WakeupState {
    IDLE,
    LIGHTING_RUN,
    GAP_AFTER_RUN,
    COMPLETE
};

static WakeupState current_state = WakeupState::IDLE;
static int current_run_index = 0;
static uint32_t state_start_time_ms = 0;

static void set_run_warm_white(int run_index) {
    // Set all LEDs in this run to warm white
    int led_count = LED_COUNT[run_index];
    for (int led_index = 0; led_index < led_count; led_index++) {
        hal::leds_set_pixel(run_index, led_index,
                           WARM_WHITE_RED, WARM_WHITE_GREEN, WARM_WHITE_BLUE);
    }
}

static void set_run_black(int run_index) {
    // Set all LEDs in this run to black
    int led_count = LED_COUNT[run_index];
    for (int led_index = 0; led_index < led_count; led_index++) {
        hal::leds_set_pixel(run_index, led_index, 0, 0, 0);
    }
}

static void set_all_runs_black() {
    for (int run_index = 0; run_index < RUN_COUNT; run_index++) {
        set_run_black(run_index);
    }
}

void wakeup_init() {
    current_state = WakeupState::IDLE;
    current_run_index = 0;
    state_start_time_ms = hal::millis();
}

void wakeup_poll() {
    if (current_state == WakeupState::COMPLETE) {
        return;
    }

    // Check if LEDs are busy - don't transition state while DMA is active
    if (hal::leds_busy()) {
        return;
    }

    uint32_t now = hal::millis();
    uint32_t elapsed = now - state_start_time_ms;

    switch (current_state) {
        case WakeupState::IDLE:
            // Start lighting the first run
            set_all_runs_black();
            set_run_warm_white(current_run_index);
            hal::leds_show();
            current_state = WakeupState::LIGHTING_RUN;
            state_start_time_ms = now;
            break;

        case WakeupState::LIGHTING_RUN:
            if (elapsed >= RUN_LIGHT_DURATION_MS) {
                // Turn off this run
                set_run_black(current_run_index);
                hal::leds_show();
                current_run_index++;

                if (current_run_index >= RUN_COUNT) {
                    // All runs complete
                    current_state = WakeupState::COMPLETE;
                } else {
                    // Wait briefly before next run
                    current_state = WakeupState::GAP_AFTER_RUN;
                    state_start_time_ms = now;
                }
            }
            break;

        case WakeupState::GAP_AFTER_RUN:
            if (elapsed >= GAP_BETWEEN_RUNS_MS) {
                // Light next run
                set_run_warm_white(current_run_index);
                hal::leds_show();
                current_state = WakeupState::LIGHTING_RUN;
                state_start_time_ms = now;
            }
            break;

        case WakeupState::COMPLETE:
            // Nothing to do
            break;
    }
}

bool wakeup_is_complete() {
    return current_state == WakeupState::COMPLETE;
}
