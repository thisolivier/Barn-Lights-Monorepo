#include <unity.h>
#include "../../src/hal/hal.h"
#include "../../src/receiver.h"
#include "../../src/config_autogen.h"
#include <cstring>

// Helper to build a packet with header and RGB data
static void build_packet(uint8_t* buffer, uint16_t session_id, uint32_t frame_id,
                         const uint8_t* rgb, size_t rgb_len) {
    // Session ID (big-endian u16)
    buffer[0] = (session_id >> 8) & 0xFF;
    buffer[1] = session_id & 0xFF;
    // Frame ID (big-endian u32)
    buffer[2] = (frame_id >> 24) & 0xFF;
    buffer[3] = (frame_id >> 16) & 0xFF;
    buffer[4] = (frame_id >> 8) & 0xFF;
    buffer[5] = frame_id & 0xFF;
    // RGB data
    if (rgb != nullptr && rgb_len > 0) {
        memcpy(buffer + 6, rgb, rgb_len);
    }
}

void setUp(void) {
    hal::test::reset();
    receiver_init();
}

void tearDown(void) {
}

// Test: Single run frame completion
void test_single_run_frame_completion(void) {
    // For RIGHT config: 1 run with 20 LEDs
    // Packet size = 6 (header) + 20 * 3 (RGB) = 66 bytes
    size_t rgb_len = LED_COUNT[0] * 3;
    size_t packet_len = 6 + rgb_len;

    uint8_t* packet = new uint8_t[packet_len];
    uint8_t* rgb_data = new uint8_t[rgb_len];

    // Fill with test pattern
    for (size_t i = 0; i < rgb_len; i++) {
        rgb_data[i] = (uint8_t)(i & 0xFF);
    }

    build_packet(packet, 1, 1, rgb_data, rgb_len);

    // Handle packet
    receiver_handle_packet(0, packet, packet_len);

    // Frame should be complete (since we only have 1 run)
    const uint8_t* frame = receiver_get_complete_frame();

    TEST_ASSERT_NOT_NULL(frame);
    TEST_ASSERT_EQUAL_MEMORY(rgb_data, frame, rgb_len);

    delete[] packet;
    delete[] rgb_data;
}

// Test: Invalid length packets are dropped
void test_length_validation(void) {
    // Send a packet with wrong length
    uint8_t packet[10] = {0, 1, 0, 0, 0, 1, 0xFF, 0xFF, 0xFF, 0xFF};

    receiver_handle_packet(0, packet, sizeof(packet));

    // Should not complete
    const uint8_t* frame = receiver_get_complete_frame();
    TEST_ASSERT_NULL(frame);

    // Check stats
    ReceiverStats stats = receiver_get_and_reset_stats();
    TEST_ASSERT_EQUAL(1, stats.rx_frames);
    TEST_ASSERT_EQUAL(1, stats.drops_len);
}

// Test: Session change clears partial frame
void test_session_change_clears_partial(void) {
    size_t rgb_len = LED_COUNT[0] * 3;
    size_t packet_len = 6 + rgb_len;

    uint8_t* packet1 = new uint8_t[packet_len];
    uint8_t* packet2 = new uint8_t[packet_len];
    uint8_t* rgb1 = new uint8_t[rgb_len];
    uint8_t* rgb2 = new uint8_t[rgb_len];

    // Fill with different patterns
    memset(rgb1, 0x11, rgb_len);
    memset(rgb2, 0x22, rgb_len);

    // Session 1, frame 1
    build_packet(packet1, 1, 1, rgb1, rgb_len);
    // Session 2, frame 1
    build_packet(packet2, 2, 1, rgb2, rgb_len);

    // Start with session 1
    receiver_handle_packet(0, packet1, packet_len);
    const uint8_t* frame1 = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame1);
    TEST_ASSERT_EQUAL_MEMORY(rgb1, frame1, rgb_len);

    // Now session 2 arrives - should reset and accept new session
    receiver_handle_packet(0, packet2, packet_len);
    const uint8_t* frame2 = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame2);
    TEST_ASSERT_EQUAL_MEMORY(rgb2, frame2, rgb_len);

    // Error should be logged for session change
    const char* error = receiver_get_last_error();
    TEST_ASSERT_NOT_NULL(error);
    TEST_ASSERT_NOT_NULL(strstr(error, "session change"));

    delete[] packet1;
    delete[] packet2;
    delete[] rgb1;
    delete[] rgb2;
}

// Test: Stale frame is dropped
void test_stale_frame_dropped(void) {
    size_t rgb_len = LED_COUNT[0] * 3;
    size_t packet_len = 6 + rgb_len;

    uint8_t* packet = new uint8_t[packet_len];
    uint8_t* rgb = new uint8_t[rgb_len];
    memset(rgb, 0xAA, rgb_len);

    // Send frame 10
    build_packet(packet, 1, 10, rgb, rgb_len);
    receiver_handle_packet(0, packet, packet_len);
    const uint8_t* frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);

    // Send stale frame 5
    build_packet(packet, 1, 5, rgb, rgb_len);
    receiver_handle_packet(0, packet, packet_len);

    // Should not complete (stale)
    frame = receiver_get_complete_frame();
    TEST_ASSERT_NULL(frame);

    // Check stats
    ReceiverStats stats = receiver_get_and_reset_stats();
    TEST_ASSERT_EQUAL(1, stats.drops_stale);

    delete[] packet;
    delete[] rgb;
}

// Test: Frame ID wraparound
void test_frame_id_wraparound(void) {
    size_t rgb_len = LED_COUNT[0] * 3;
    size_t packet_len = 6 + rgb_len;

    uint8_t* packet = new uint8_t[packet_len];
    uint8_t* rgb = new uint8_t[rgb_len];
    memset(rgb, 0xBB, rgb_len);

    // Send frame 0xFFFFFFFF
    build_packet(packet, 1, 0xFFFFFFFF, rgb, rgb_len);
    receiver_handle_packet(0, packet, packet_len);
    const uint8_t* frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);

    // Send frame 0x00000001 (should be newer due to wraparound)
    build_packet(packet, 1, 0x00000001, rgb, rgb_len);
    receiver_handle_packet(0, packet, packet_len);
    frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);

    // Stats should show no stale drops
    ReceiverStats stats = receiver_get_and_reset_stats();
    TEST_ASSERT_EQUAL(0, stats.drops_stale);

    delete[] packet;
    delete[] rgb;
}

// Test: Out of order frames - newer completes first
void test_out_of_order_frames(void) {
    size_t rgb_len = LED_COUNT[0] * 3;
    size_t packet_len = 6 + rgb_len;

    uint8_t* packet = new uint8_t[packet_len];
    uint8_t* rgb10 = new uint8_t[rgb_len];
    uint8_t* rgb11 = new uint8_t[rgb_len];

    memset(rgb10, 0x10, rgb_len);
    memset(rgb11, 0x11, rgb_len);

    // Send frame 10
    build_packet(packet, 1, 10, rgb10, rgb_len);
    receiver_handle_packet(0, packet, packet_len);
    const uint8_t* frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);
    TEST_ASSERT_EQUAL(0x10, frame[0]);

    // Send frame 11 (newer)
    build_packet(packet, 1, 11, rgb11, rgb_len);
    receiver_handle_packet(0, packet, packet_len);
    frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);
    TEST_ASSERT_EQUAL(0x11, frame[0]);

    delete[] packet;
    delete[] rgb10;
    delete[] rgb11;
}

// Test: Stats tracking
void test_stats_tracking(void) {
    size_t rgb_len = LED_COUNT[0] * 3;
    size_t packet_len = 6 + rgb_len;

    uint8_t* packet = new uint8_t[packet_len];
    uint8_t* rgb = new uint8_t[rgb_len];
    memset(rgb, 0x00, rgb_len);

    // Send 5 valid packets
    for (uint32_t i = 1; i <= 5; i++) {
        build_packet(packet, 1, i, rgb, rgb_len);
        receiver_handle_packet(0, packet, packet_len);
        receiver_get_complete_frame(); // Consume the frame
    }

    // Send 2 invalid length packets
    receiver_handle_packet(0, packet, 10);
    receiver_handle_packet(0, packet, 10);

    // Get and reset stats
    ReceiverStats stats = receiver_get_and_reset_stats();
    TEST_ASSERT_EQUAL(7, stats.rx_frames);
    TEST_ASSERT_EQUAL(5, stats.complete_frames);
    TEST_ASSERT_EQUAL(5, stats.applied_frames);
    TEST_ASSERT_EQUAL(2, stats.drops_len);

    // Stats should be reset after get
    ReceiverStats stats2 = receiver_get_and_reset_stats();
    TEST_ASSERT_EQUAL(0, stats2.rx_frames);

    delete[] packet;
    delete[] rgb;
}

// Test: Invalid run index
void test_invalid_run_index(void) {
    uint8_t packet[100] = {0};

    // Run index beyond RUN_COUNT should be dropped
    receiver_handle_packet(RUN_COUNT + 1, packet, sizeof(packet));

    ReceiverStats stats = receiver_get_and_reset_stats();
    TEST_ASSERT_EQUAL(1, stats.rx_frames);
    TEST_ASSERT_EQUAL(1, stats.drops_len);
}

int main(int argc, char** argv) {
    UNITY_BEGIN();

    RUN_TEST(test_single_run_frame_completion);
    RUN_TEST(test_length_validation);
    RUN_TEST(test_session_change_clears_partial);
    RUN_TEST(test_stale_frame_dropped);
    RUN_TEST(test_frame_id_wraparound);
    RUN_TEST(test_out_of_order_frames);
    RUN_TEST(test_stats_tracking);
    RUN_TEST(test_invalid_run_index);

    return UNITY_END();
}
