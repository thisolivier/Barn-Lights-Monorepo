#include <unity.h>
#include "../../src/hal/hal.h"
#include "../../src/status.h"
#include "../../src/network.h"
#include "../../src/receiver.h"
#include "../../src/config_autogen.h"
#include <cstring>

void setUp(void) {
    hal::test::reset();
    receiver_init();
}

void tearDown(void) {
}

// Test: Heartbeat is sent at 1s interval
void test_heartbeat_interval(void) {
    hal::test::set_time(0);
    status_init();

    // Initially no heartbeat
    TEST_ASSERT_EQUAL(0, hal::test::get_sent_heartbeats().size());

    // Just before 1s - no heartbeat yet
    hal::test::set_time(999);
    status_poll();
    TEST_ASSERT_EQUAL(0, hal::test::get_sent_heartbeats().size());

    // At 1s+ - heartbeat should be sent
    hal::test::set_time(1001);
    status_poll();
    TEST_ASSERT_EQUAL(1, hal::test::get_sent_heartbeats().size());

    // Before next interval - no new heartbeat
    hal::test::set_time(1500);
    status_poll();
    TEST_ASSERT_EQUAL(1, hal::test::get_sent_heartbeats().size());

    // At 2s+ - second heartbeat
    hal::test::set_time(2001);
    status_poll();
    TEST_ASSERT_EQUAL(2, hal::test::get_sent_heartbeats().size());
}

// Test: Heartbeat JSON contains required fields
void test_heartbeat_json_format(void) {
    hal::test::set_time(5000);
    status_init();

    hal::test::set_time(6001);
    status_poll();

    auto& heartbeats = hal::test::get_sent_heartbeats();
    TEST_ASSERT_EQUAL(1, heartbeats.size());

    const std::string& json = heartbeats[0];

    // Check for required fields
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"id\":\""));
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"ip\":\""));
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"uptime_ms\":"));
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"link\":"));
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"runs\":"));
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"leds\":["));
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"rx_frames\":"));
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"complete\":"));
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"applied\":"));
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"dropped_frames\":"));
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"errors\":["));
}

// Test: Heartbeat contains correct SIDE_ID
void test_heartbeat_contains_side_id(void) {
    hal::test::set_time(0);
    status_init();

    hal::test::set_time(1001);
    status_poll();

    auto& heartbeats = hal::test::get_sent_heartbeats();
    TEST_ASSERT_EQUAL(1, heartbeats.size());

    const std::string& json = heartbeats[0];
    std::string expected_id = std::string("\"id\":\"") + SIDE_ID + "\"";
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find(expected_id));
}

// Test: Heartbeat reports correct run count
void test_heartbeat_run_count(void) {
    hal::test::set_time(0);
    status_init();

    hal::test::set_time(1001);
    status_poll();

    auto& heartbeats = hal::test::get_sent_heartbeats();
    const std::string& json = heartbeats[0];

    char expected[32];
    snprintf(expected, sizeof(expected), "\"runs\":%d", RUN_COUNT);
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find(expected));
}

// Test: Uptime increases over time
void test_heartbeat_uptime(void) {
    hal::test::set_time(1000);
    status_init();

    // First heartbeat at t=2001
    hal::test::set_time(2001);
    status_poll();

    auto& heartbeats = hal::test::get_sent_heartbeats();
    TEST_ASSERT_EQUAL(1, heartbeats.size());

    // Uptime should be approximately 1001ms (2001 - 1000)
    const std::string& json = heartbeats[0];
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"uptime_ms\":1001"));

    // Second heartbeat at t=5000
    hal::test::set_time(5000);
    status_poll();

    TEST_ASSERT_EQUAL(2, heartbeats.size());
    // Uptime should be approximately 4000ms
    const std::string& json2 = heartbeats[1];
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json2.find("\"uptime_ms\":4000"));
}

// Test: Heartbeat reports link status
void test_heartbeat_link_status(void) {
    hal::test::set_time(0);
    status_init();

    hal::test::set_time(1001);
    status_poll();

    auto& heartbeats = hal::test::get_sent_heartbeats();
    const std::string& json = heartbeats[0];

    // Default link status is true in native HAL
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"link\":true"));
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

// Test: Stats are included in heartbeat
void test_heartbeat_includes_stats(void) {
    hal::test::set_time(0);
    status_init();

    // Send some packets to generate stats
    size_t rgb_len = LED_COUNT[0] * 3;
    size_t packet_len = 6 + rgb_len;
    uint8_t* packet = new uint8_t[packet_len];
    uint8_t* rgb = new uint8_t[rgb_len];
    memset(rgb, 0xFF, rgb_len);

    build_packet(packet, 1, 1, rgb, rgb_len);
    receiver_handle_packet(0, packet, packet_len);
    receiver_get_complete_frame();

    build_packet(packet, 1, 2, rgb, rgb_len);
    receiver_handle_packet(0, packet, packet_len);
    receiver_get_complete_frame();

    // Send heartbeat
    hal::test::set_time(1001);
    status_poll();

    auto& heartbeats = hal::test::get_sent_heartbeats();
    const std::string& json = heartbeats[0];

    // Should report 2 rx_frames, 2 complete, 2 applied
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"rx_frames\":2"));
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"complete\":2"));
    TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"applied\":2"));

    delete[] packet;
    delete[] rgb;
}

int main(int argc, char** argv) {
    UNITY_BEGIN();

    RUN_TEST(test_heartbeat_interval);
    RUN_TEST(test_heartbeat_json_format);
    RUN_TEST(test_heartbeat_contains_side_id);
    RUN_TEST(test_heartbeat_run_count);
    RUN_TEST(test_heartbeat_uptime);
    RUN_TEST(test_heartbeat_link_status);
    RUN_TEST(test_heartbeat_includes_stats);

    return UNITY_END();
}
