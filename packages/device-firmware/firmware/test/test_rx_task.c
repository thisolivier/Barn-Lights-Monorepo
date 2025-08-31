#include "unity.h"
#include "rx_task.h"
#include "config_autogen.h"
#include <stdlib.h>
#include <string.h>

void setUp(void) {
    rx_task_start();
}

void tearDown(void) {
}

void test_invalid_length_ignored(void) {
    size_t len = 4 + LED_COUNT[0] * 3 - 3;
    uint8_t *packet = (uint8_t *)malloc(len);
    memset(packet, 0, len);
    packet[3] = 1;
    rx_task_process_packet(0, packet, len);
    TEST_ASSERT_FALSE(rx_task_run_received(0, 0));
    free(packet);
}

void test_copy_payload_without_reordering(void) {
    size_t length = 4 + LED_COUNT[0] * 3;
    uint8_t *packet = (uint8_t *)malloc(length);
    memset(packet, 0, length);
    packet[3] = 1;
    packet[4] = 1; // R
    packet[5] = 2; // G
    packet[6] = 3; // B
    rx_task_process_packet(0, packet, length);
    const uint8_t *buffer = rx_task_get_run_buffer(0, 0);
    TEST_ASSERT_EQUAL_UINT8(1, buffer[0]);
    TEST_ASSERT_EQUAL_UINT8(2, buffer[1]);
    TEST_ASSERT_EQUAL_UINT8(3, buffer[2]);
    free(packet);
}

void test_frame_slots_only_keep_current_and_next(void) {
    // complete frame 1 for all runs
    for (unsigned int run = 0; run < RUN_COUNT; ++run) {
        size_t len = 4 + LED_COUNT[run] * 3;
        uint8_t *packet = (uint8_t *)malloc(len);
        memset(packet, 0, len);
        packet[3] = 1;
        rx_task_process_packet(run, packet, len);
        free(packet);
    }
    TEST_ASSERT_EQUAL_UINT32(1, rx_task_get_frame_id(0));

    size_t len0 = 4 + LED_COUNT[0] * 3;
    uint8_t *packet = (uint8_t *)malloc(len0);
    memset(packet, 0, len0);

    // send frame 2 for run 0
    packet[3] = 2;
    rx_task_process_packet(0, packet, len0);
    if (RUN_COUNT > 1) {
        TEST_ASSERT_EQUAL_UINT32(2, rx_task_get_frame_id(1));

        // send frame 3 which should be ignored because slots are full
        packet[3] = 3;
        rx_task_process_packet(0, packet, len0);
        TEST_ASSERT_EQUAL_UINT32(2, rx_task_get_frame_id(1));
    } else {
        // with a single run, frame 2 becomes the current frame
        TEST_ASSERT_EQUAL_UINT32(2, rx_task_get_frame_id(1));
        TEST_ASSERT_EQUAL_UINT32(0, rx_task_get_frame_id(0));

        packet[3] = 3;
        rx_task_process_packet(0, packet, len0);
        TEST_ASSERT_EQUAL_UINT32(3, rx_task_get_frame_id(0));
        TEST_ASSERT_EQUAL_UINT32(0, rx_task_get_frame_id(1));
    }
    free(packet);
}

int main(void) {
    UNITY_BEGIN();
    RUN_TEST(test_invalid_length_ignored);
    RUN_TEST(test_copy_payload_without_reordering);
    RUN_TEST(test_frame_slots_only_keep_current_and_next);
    return UNITY_END();
}
