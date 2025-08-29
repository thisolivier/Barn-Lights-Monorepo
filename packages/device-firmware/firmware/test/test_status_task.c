#include "unity.h"
#include "status_task.h"
#include "config_autogen.h"
#include <string.h>

void setUp(void) { status_task_reset_counters(); }
void tearDown(void) {}

void test_format_json(void) {
    status_task_increment_rx_frames();
    status_task_increment_complete();
    status_task_increment_applied();
    status_task_increment_drops();
    char buf[256];
    size_t len = status_task_format_json(buf, sizeof(buf), 123, true);
    const char *expected =
        "{\"id\":\"LEFT\",\"ip\":\"192.168.0.50\",\"uptime_ms\":123,\"link\":true,\"runs\":3,\"leds\":[400,400,400],\"rx_frames\":1,\"complete\":1,\"applied\":1,\"dropped_frames\":1,\"errors\":[]}";
    TEST_ASSERT_EQUAL(strlen(expected), len);
    TEST_ASSERT_EQUAL_STRING(expected, buf);
}

int main(void) {
    UNITY_BEGIN();
    RUN_TEST(test_format_json);
    return UNITY_END();
}
