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

// Helper to inject a complete frame (sends packets for ALL runs)
// This is required for multi-run configurations where frame completion
// requires receiving packets for all runs (received_mask == EXPECTED_MASK)
static void inject_complete_frame(uint16_t session_id, uint32_t frame_id,
                                  uint8_t red, uint8_t green, uint8_t blue) {
    for (int run_index = 0; run_index < RUN_COUNT; run_index++) {
        size_t rgb_len = LED_COUNT[run_index] * 3;
        size_t packet_len = 6 + rgb_len;

        uint8_t* packet = new uint8_t[packet_len];
        uint8_t* rgb = new uint8_t[rgb_len];

        // Fill all LEDs with the same color
        for (size_t i = 0; i < rgb_len; i += 3) {
            rgb[i] = red;
            rgb[i + 1] = green;
            rgb[i + 2] = blue;
        }

        build_packet(packet, session_id, frame_id, rgb, rgb_len);
        receiver_handle_packet(run_index, packet, packet_len);

        delete[] packet;
        delete[] rgb;
    }
}

void setUp(void) {
    hal::test::reset();
    receiver_init();
}

void tearDown(void) {
}

// Test: Complete frame received (all runs)
void test_complete_frame_received(void) {
    // Inject a complete frame with solid red color
    inject_complete_frame(1, 1, 0xAA, 0xBB, 0xCC);

    // Frame should be complete
    const uint8_t* frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);

    // Verify first LED of run 0 has the expected color
    TEST_ASSERT_EQUAL(0xAA, frame[0]);
    TEST_ASSERT_EQUAL(0xBB, frame[1]);
    TEST_ASSERT_EQUAL(0xCC, frame[2]);
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
    // Session 1, frame 1 - solid 0x11 color
    inject_complete_frame(1, 1, 0x11, 0x11, 0x11);
    const uint8_t* frame1 = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame1);
    TEST_ASSERT_EQUAL(0x11, frame1[0]);

    // Now session 2 arrives - should reset and accept new session
    inject_complete_frame(2, 1, 0x22, 0x22, 0x22);
    const uint8_t* frame2 = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame2);
    TEST_ASSERT_EQUAL(0x22, frame2[0]);

    // Error should be logged for session change
    const char* error = receiver_get_last_error();
    TEST_ASSERT_NOT_NULL(error);
    TEST_ASSERT_NOT_NULL(strstr(error, "session change"));
}

// Test: Stale frame is dropped
void test_stale_frame_dropped(void) {
    // Send frame 10 (complete)
    inject_complete_frame(1, 10, 0xAA, 0xAA, 0xAA);
    const uint8_t* frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);

    // Send stale frame 5 (only run 0 to trigger stale detection)
    // Note: We send only run 0 since the stale check happens per-packet
    size_t rgb_len = LED_COUNT[0] * 3;
    size_t packet_len = 6 + rgb_len;

    uint8_t* packet = new uint8_t[packet_len];
    uint8_t* rgb = new uint8_t[rgb_len];
    memset(rgb, 0xBB, rgb_len);

    build_packet(packet, 1, 5, rgb, rgb_len);
    receiver_handle_packet(0, packet, packet_len);

    // Should not complete (stale)
    frame = receiver_get_complete_frame();
    TEST_ASSERT_NULL(frame);

    // Check stats - each packet from inject_complete_frame is counted
    ReceiverStats stats = receiver_get_and_reset_stats();
    TEST_ASSERT_EQUAL(1, stats.drops_stale);

    delete[] packet;
    delete[] rgb;
}

// Test: Frame ID wraparound
void test_frame_id_wraparound(void) {
    // Send frame 0xFFFFFFFF
    inject_complete_frame(1, 0xFFFFFFFF, 0xBB, 0xBB, 0xBB);
    const uint8_t* frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);

    // Send frame 0x00000001 (should be newer due to wraparound)
    inject_complete_frame(1, 0x00000001, 0xCC, 0xCC, 0xCC);
    frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);

    // Stats should show no stale drops
    ReceiverStats stats = receiver_get_and_reset_stats();
    TEST_ASSERT_EQUAL(0, stats.drops_stale);
}

// Test: Out of order frames - newer completes first
void test_out_of_order_frames(void) {
    // Send frame 10
    inject_complete_frame(1, 10, 0x10, 0x10, 0x10);
    const uint8_t* frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);
    TEST_ASSERT_EQUAL(0x10, frame[0]);

    // Send frame 11 (newer)
    inject_complete_frame(1, 11, 0x11, 0x11, 0x11);
    frame = receiver_get_complete_frame();
    TEST_ASSERT_NOT_NULL(frame);
    TEST_ASSERT_EQUAL(0x11, frame[0]);
}

// Test: Stats tracking
void test_stats_tracking(void) {
    // Send 5 complete frames (each frame = RUN_COUNT packets)
    for (uint32_t frame_idx = 1; frame_idx <= 5; frame_idx++) {
        inject_complete_frame(1, frame_idx, 0x00, 0x00, 0x00);
        receiver_get_complete_frame(); // Consume the frame
    }

    // Send 2 invalid length packets (only for run 0)
    size_t rgb_len = LED_COUNT[0] * 3;
    size_t packet_len = 6 + rgb_len;
    uint8_t* packet = new uint8_t[packet_len];
    memset(packet, 0x00, packet_len);

    receiver_handle_packet(0, packet, 10);
    receiver_handle_packet(0, packet, 10);

    // Get and reset stats
    ReceiverStats stats = receiver_get_and_reset_stats();
    // rx_frames counts all packets: 5 frames * RUN_COUNT packets + 2 invalid
    TEST_ASSERT_EQUAL(5 * RUN_COUNT + 2, stats.rx_frames);
    TEST_ASSERT_EQUAL(5, stats.complete_frames);
    TEST_ASSERT_EQUAL(5, stats.applied_frames);
    TEST_ASSERT_EQUAL(2, stats.drops_len);

    // Stats should be reset after get
    ReceiverStats stats2 = receiver_get_and_reset_stats();
    TEST_ASSERT_EQUAL(0, stats2.rx_frames);

    delete[] packet;
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

    RUN_TEST(test_complete_frame_received);
    RUN_TEST(test_length_validation);
    RUN_TEST(test_session_change_clears_partial);
    RUN_TEST(test_stale_frame_dropped);
    RUN_TEST(test_frame_id_wraparound);
    RUN_TEST(test_out_of_order_frames);
    RUN_TEST(test_stats_tracking);
    RUN_TEST(test_invalid_run_index);

    return UNITY_END();
}
