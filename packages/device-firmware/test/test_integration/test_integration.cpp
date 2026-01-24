#include <unity.h>
#include "../../src/hal/hal.h"
#include "../../src/led_driver.h"
#include "../../src/receiver.h"
#include "../../src/status.h"
#include "../../src/led_status.h"
#include "../../src/network.h"
#include "../../src/config_autogen.h"
#include <cstring>

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

// Helper to inject a complete frame via HAL
static void inject_complete_frame(uint16_t session_id, uint32_t frame_id,
                                  uint8_t r, uint8_t g, uint8_t b) {
    size_t rgb_len = LED_COUNT[0] * 3;
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
    hal::test::inject_packet(0, packet, packet_len);

    delete[] packet;
    delete[] rgb;
}

void setUp(void) {
    hal::test::reset();
    driver_init();
    receiver_init();
    status_init();
    led_status_init();
}

void tearDown(void) {
}

// Test: Full pipeline - packet to LED output
void test_full_pipeline(void) {
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
    hal::test::set_time(0);

    // Process some frames
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

    // Trigger heartbeat
    hal::test::set_time(2100);
    status_poll();

    auto& heartbeats = hal::test::get_sent_heartbeats();
    TEST_ASSERT_EQUAL(1, heartbeats.size());

    // Should report 2 frames received and applied
    const std::string& json = heartbeats[0];
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"rx_frames\":2"));
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"applied\":2"));
}

// Test: Main loop simulation
void test_main_loop_simulation(void) {
    hal::test::set_time(0);

    // Simulate 3 seconds of operation
    for (int ms = 0; ms < 3000; ms += 16) {  // ~60fps
        hal::test::set_time(ms);

        // Inject a frame every ~16ms
        if (ms >= 1100) {  // After blackout
            uint32_t frame_id = (ms - 1100) / 16 + 1;
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

    // Should have sent 2-3 heartbeats
    auto& heartbeats = hal::test::get_sent_heartbeats();
    TEST_ASSERT_GREATER_OR_EQUAL(2, heartbeats.size());

    // Should have shown many frames
    TEST_ASSERT_GREATER_THAN(50, hal::test::get_show_count());
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

    return UNITY_END();
}
