#include "unity.h"
#include "status_task.h"
#include "config_autogen.h"
#include <stdio.h>
#include <string.h>

void setUp(void) { status_task_reset_counters(); }
void tearDown(void) {}

void test_format_json(void) {
    status_task_increment_rx_frames();
    status_task_increment_complete();
    status_task_increment_applied();
    status_task_increment_drops();

    char json_buffer[256];
    size_t json_length = status_task_format_json(json_buffer, sizeof(json_buffer), 123, true);

    const char *side_str = SIDE_ID == 0 ? "LEFT" : "RIGHT";
    char expected[256];
    size_t offset = 0;
    offset += snprintf(expected + offset, sizeof(expected) - offset,
                       "{\"id\":\"%s\",\"ip\":\"%u.%u.%u.%u\",\"uptime_ms\":123,\"link\":true,\"runs\":%u,\"leds\":[",
                       side_str, STATIC_IP_ADDR0, STATIC_IP_ADDR1, STATIC_IP_ADDR2, STATIC_IP_ADDR3, RUN_COUNT);
    for (unsigned int i = 0; i < RUN_COUNT; ++i) {
        offset += snprintf(expected + offset, sizeof(expected) - offset, "%u", LED_COUNT[i]);
        if (i + 1 < RUN_COUNT) {
            offset += snprintf(expected + offset, sizeof(expected) - offset, ",");
        }
    }
    offset += snprintf(expected + offset, sizeof(expected) - offset,
                       "],\"rx_frames\":1,\"complete\":1,\"applied\":1,\"dropped_frames\":1,\"errors\":[]}");

    TEST_ASSERT_EQUAL(offset, json_length);
    TEST_ASSERT_EQUAL_STRING(expected, json_buffer);
}

int main(void) {
    UNITY_BEGIN();
    RUN_TEST(test_format_json);
    return UNITY_END();
}
