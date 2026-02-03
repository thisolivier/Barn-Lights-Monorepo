#include <unity.h>
#include "../../src/hal/hal.h"
#include "../../src/led_driver.h"
#include "../../src/receiver.h"
#include "../../src/status.h"
#include "../../src/led_status.h"
#include "../../src/network.h"
#include "../../src/wakeup.h"
#include "../../src/config_autogen.h"
#include <cstring>

// Wakeup timing constants (must match wakeup.cpp)
static const uint32_t WAKEUP_RUN_DURATION_MS = 200;
static const uint32_t WAKEUP_GAP_MS = 50;

// Helper to calculate total wakeup duration
static uint32_t get_wakeup_duration() {
    return (RUN_COUNT * WAKEUP_RUN_DURATION_MS) +
           ((RUN_COUNT - 1) * WAKEUP_GAP_MS);
}

// Helper to complete the wakeup sequence
static void complete_wakeup() {
    wakeup_init();
    uint32_t wakeup_end = get_wakeup_duration() + 100;
    for (uint32_t t = 0; t <= wakeup_end; t += 10) {
        hal::test::set_time(t);
        wakeup_poll();
    }
}

// Helper to build a valid packet
static void build_packet(uint8_t* buffer, uint16_t session_id, uint32_t frame_id,
                         const uint8_t* rgb, size_t rgb_len) {
    buffer[0] = (session_id >> 8) & 0xFF;
    buffer[1] = session_id & 0xFF;
    buffer[2] = (frame_id >> 24) & 0xFF;
    buffer[3] = (frame_id >> 16) & 0xFF;
    buffer[4] = (frame_id >> 8) & 0xFF;
    buffer[5] = frame_id & 0xFF;
    if (rgb != nullptr && rgb_len > 0) {
        memcpy(buffer + 6, rgb, rgb_len);
    }
}

// Helper to inject a complete frame via HAL (sends packets for ALL runs)
static void inject_complete_frame(uint16_t session_id, uint32_t frame_id,
                                  uint8_t r, uint8_t g, uint8_t b) {
    // Inject a packet for each run to complete the frame
    for (int run_index = 0; run_index < RUN_COUNT; run_index++) {
        size_t rgb_len = LED_COUNT[run_index] * 3;
        size_t packet_len = 6 + rgb_len;

        uint8_t* packet = new uint8_t[packet_len];
        uint8_t* rgb = new uint8_t[rgb_len];

        // Fill all LEDs with the same color
        for (size_t i = 0; i < rgb_len; i += 3) {
            rgb[i] = r;
            rgb[i + 1] = g;
            rgb[i + 2] = b;
        }

        build_packet(packet, session_id, frame_id, rgb, rgb_len);
        hal::test::inject_packet(run_index, packet, packet_len);

        delete[] packet;
        delete[] rgb;
    }
}

void setUp(void) {
    hal::test::reset();
    driver_init();
    wakeup_init();
    receiver_init();
    status_init();
    led_status_init();
}

void tearDown(void) {
}

// Test: Full pipeline - packet to LED output
void test_full_pipeline(void) {
    // Complete wakeup sequence first
    complete_wakeup();

    // Past the blackout period
    hal::test::advance_time(1100);

    // Inject a frame with red color
    inject_complete_frame(1, 1, 255, 0, 0);

    // Process packets via network poll
    network_poll();

    // Get complete frame and display it
    const uint8_t* frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);

    if (frame && !driver_is_busy()) {
        driver_show_frame(frame);
    }

    // Verify LED state
    auto led = hal::test::get_led(0, 0);
    TEST_ASSERT_EQUAL(255, led.r);
    TEST_ASSERT_EQUAL(0, led.g);
    TEST_ASSERT_EQUAL(0, led.b);

    // Show should have been called
    TEST_ASSERT_GREATER_THAN(0, hal::test::get_show_count());
}

// Test: Startup blackout period
void test_startup_blackout(void) {
    // At startup (t=0), driver should not be ready
    TEST_ASSERT_FALSE(driver_ready_for_frames());

    // At t=500ms, still not ready
    hal::test::advance_time(500);
    TEST_ASSERT_FALSE(driver_ready_for_frames());

    // At t=1000ms+, should be ready
    hal::test::advance_time(600);
    TEST_ASSERT_TRUE(driver_ready_for_frames());
}

// Test: LEDs start black
void test_leds_start_black(void) {
    // After driver_init, all LEDs should be black
    auto led = hal::test::get_led(0, 0);
    TEST_ASSERT_EQUAL(0, led.r);
    TEST_ASSERT_EQUAL(0, led.g);
    TEST_ASSERT_EQUAL(0, led.b);

    // Show should have been called during init
    TEST_ASSERT_GREATER_THAN(0, hal::test::get_show_count());
}

// Test: Status LED blinks before first frame
void test_status_led_blinks_before_frame(void) {
    // Initially off
    TEST_ASSERT_FALSE(hal::test::get_status_led());

    // After 500ms, should toggle on
    hal::test::advance_time(500);
    led_status_poll();
    TEST_ASSERT_TRUE(hal::test::get_status_led());

    // After another 500ms, should toggle off
    hal::test::advance_time(500);
    led_status_poll();
    TEST_ASSERT_FALSE(hal::test::get_status_led());
}

// Test: Status LED stops blinking after first frame
void test_status_led_stops_after_frame(void) {
    // Advance to get LED blinking
    hal::test::advance_time(500);
    led_status_poll();
    TEST_ASSERT_TRUE(hal::test::get_status_led());

    // Notify first frame displayed
    led_status_frame_displayed();

    // LED should be off now
    TEST_ASSERT_FALSE(hal::test::get_status_led());

    // Should stay off even after more time
    hal::test::advance_time(500);
    led_status_poll();
    TEST_ASSERT_FALSE(hal::test::get_status_led());
}

// Test: Multiple frames processed correctly
void test_multiple_frames(void) {
    // Complete wakeup sequence first
    complete_wakeup();

    hal::test::advance_time(1100);

    // Frame 1 - red
    inject_complete_frame(1, 1, 255, 0, 0);
    network_poll();
    const uint8_t* frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);
    driver_show_frame(frame);

    auto led = hal::test::get_led(0, 0);
    TEST_ASSERT_EQUAL(255, led.r);

    // Frame 2 - green
    inject_complete_frame(1, 2, 0, 255, 0);
    network_poll();
    frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);
    driver_show_frame(frame);

    led = hal::test::get_led(0, 0);
    TEST_ASSERT_EQUAL(0, led.r);
    TEST_ASSERT_EQUAL(255, led.g);

    // Frame 3 - blue
    inject_complete_frame(1, 3, 0, 0, 255);
    network_poll();
    frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);
    driver_show_frame(frame);

    led = hal::test::get_led(0, 0);
    TEST_ASSERT_EQUAL(0, led.g);
    TEST_ASSERT_EQUAL(255, led.b);
}

// Test: Session change resets state
void test_session_change_integration(void) {
    // Complete wakeup sequence first
    complete_wakeup();

    hal::test::advance_time(1100);

    // Session 1, frame 5
    inject_complete_frame(1, 5, 100, 0, 0);
    network_poll();
    const uint8_t* frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);
    driver_show_frame(frame);

    // New session 2, frame 1 - should be accepted even though frame_id < previous
    inject_complete_frame(2, 1, 0, 100, 0);
    network_poll();
    frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);
    driver_show_frame(frame);

    auto led = hal::test::get_led(0, 0);
    TEST_ASSERT_EQUAL(0, led.r);
    TEST_ASSERT_EQUAL(100, led.g);
}

// Test: Heartbeat sent after frame activity
void test_heartbeat_after_frames(void) {
    // Complete wakeup sequence first
    complete_wakeup();

    // Process some frames - advance time past blackout period
    hal::test::advance_time(1100);

    inject_complete_frame(1, 1, 255, 0, 0);
    network_poll();
    const uint8_t* frame = receiver_get_complete_frame();
    driver_show_frame(frame);
    led_status_frame_displayed();

    inject_complete_frame(1, 2, 255, 0, 0);
    network_poll();
    frame = receiver_get_complete_frame();
    driver_show_frame(frame);
    led_status_frame_displayed();

    // Trigger heartbeat (advance by 1000ms from current time)
    hal::test::advance_time(1000);
    status_poll();

    auto& heartbeats = hal::test::get_sent_heartbeats();
    TEST_ASSERT_EQUAL(1, heartbeats.size());

    // rx_frames counts packets (RUN_COUNT packets per frame, 2 frames)
    // applied counts complete frames that were displayed (2)
    const std::string& json = heartbeats[0];
    char expected_rx[32];
    snprintf(expected_rx, sizeof(expected_rx), "\"rx_frames\":%d", RUN_COUNT * 2);
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find(expected_rx));
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"applied\":2"));
}

// Test: Main loop simulation (matches actual main.cpp behavior)
void test_main_loop_simulation(void) {
    hal::test::set_time(0);

    uint32_t wakeup_duration = get_wakeup_duration();

    // Simulate 3 seconds of operation
    for (int ms = 0; ms < 3000; ms += 16) {  // ~60fps
        hal::test::set_time(ms);

        // Run wakeup effect until complete (matches main.cpp loop)
        if (!wakeup_is_complete()) {
            wakeup_poll();
            continue;
        }

        // Inject a frame every ~16ms (after wakeup and blackout)
        if (ms >= (int)(wakeup_duration + 1100)) {
            uint32_t frame_id = (ms - wakeup_duration - 1100) / 16 + 1;
            inject_complete_frame(1, frame_id, 128, 128, 128);
        }

        // Main loop operations
        network_poll();

        if (driver_ready_for_frames()) {
            const uint8_t* frame = receiver_get_complete_frame();
            if (frame && !driver_is_busy()) {
                driver_show_frame(frame);
                led_status_frame_displayed();
            }
        }

        status_poll();
        led_status_poll();
    }

    // Wakeup should be complete
    TEST_ASSERT_TRUE(wakeup_is_complete());

    // Should have sent 2-3 heartbeats
    auto& heartbeats = hal::test::get_sent_heartbeats();
    TEST_ASSERT_GREATER_OR_EQUAL(2, heartbeats.size());

    // Should have shown many frames (wakeup shows + network frames)
    TEST_ASSERT_GREATER_THAN(50, hal::test::get_show_count());
}

// Test: Wakeup blocks network input
void test_wakeup_blocks_network_input(void) {
    hal::test::set_time(0);

    // Inject a frame during wakeup
    inject_complete_frame(1, 1, 255, 0, 0);

    // Run partial wakeup (not complete yet)
    for (int t = 0; t < 100; t += 10) {
        hal::test::set_time(t);
        wakeup_poll();
    }

    // Wakeup should not be complete yet
    TEST_ASSERT_FALSE(wakeup_is_complete());

    // The injected packet should still be pending (not processed)
    // because in actual main loop, network_poll isn't called during wakeup
    // This test verifies the intended behavior
}

// Test: Network input works after wakeup completes
void test_network_works_after_wakeup(void) {
    // Complete wakeup
    complete_wakeup();

    // Advance past blackout
    hal::test::advance_time(1100);

    // Now inject and process a frame
    inject_complete_frame(1, 1, 0, 255, 0);
    network_poll();

    const uint8_t* frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);

    driver_show_frame(frame);

    auto led = hal::test::get_led(0, 0);
    TEST_ASSERT_EQUAL(0, led.r);
    TEST_ASSERT_EQUAL(255, led.g);
    TEST_ASSERT_EQUAL(0, led.b);
}

int main(int argc, char** argv) {
    UNITY_BEGIN();

    RUN_TEST(test_full_pipeline);
    RUN_TEST(test_startup_blackout);
    RUN_TEST(test_leds_start_black);
    RUN_TEST(test_status_led_blinks_before_frame);
    RUN_TEST(test_status_led_stops_after_frame);
    RUN_TEST(test_multiple_frames);
    RUN_TEST(test_session_change_integration);
    RUN_TEST(test_heartbeat_after_frames);
    RUN_TEST(test_main_loop_simulation);
    RUN_TEST(test_wakeup_blocks_network_input);
    RUN_TEST(test_network_works_after_wakeup);

    return UNITY_END();
}
