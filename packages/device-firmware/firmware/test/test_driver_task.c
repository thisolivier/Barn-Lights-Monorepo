#include "unity.h"
#include <stdbool.h>
#include <stdint.h>

typedef int esp_err_t;
#define ESP_OK 0
#define ESP_ERR_TIMEOUT 0x105

typedef void *rmt_channel_handle_t;
typedef int TickType_t;

#define pdMS_TO_TICKS(ms) (ms)

static int delay_calls;
static void vTaskDelay(TickType_t ticks) {
    (void)ticks;
    ++delay_calls;
}

static int wait_failures;
static bool warning_logged;

static esp_err_t rmt_tx_wait_all_done(rmt_channel_handle_t channel, TickType_t ticks) {
    (void)channel;
    (void)ticks;
    if (wait_failures-- > 0) {
        return ESP_ERR_TIMEOUT;
    }
    return ESP_OK;
}

static esp_err_t wait_all_done_retry(rmt_channel_handle_t channel) {
    const int MAX_ATTEMPTS = 5;
    for (int attempt = 0; attempt < MAX_ATTEMPTS; ++attempt) {
        esp_err_t err = rmt_tx_wait_all_done(channel, pdMS_TO_TICKS(1));
        if (err == ESP_OK) {
            return ESP_OK;
        }
        if (err != ESP_ERR_TIMEOUT) {
            return err;
        }
        vTaskDelay(pdMS_TO_TICKS(1));
    }
    warning_logged = true;
    return ESP_ERR_TIMEOUT;
}

void setUp(void) {}
void tearDown(void) {}

void test_retry_eventually_succeeds(void) {
    wait_failures = 2;
    warning_logged = false;
    delay_calls = 0;
    esp_err_t err = wait_all_done_retry(NULL);
    TEST_ASSERT_EQUAL(ESP_OK, err);
    TEST_ASSERT_EQUAL(2, delay_calls);
    TEST_ASSERT_FALSE(warning_logged);
}

void test_retry_warns_after_exhaustion(void) {
    wait_failures = 10; // always timeout
    warning_logged = false;
    delay_calls = 0;
    esp_err_t err = wait_all_done_retry(NULL);
    TEST_ASSERT_EQUAL(ESP_ERR_TIMEOUT, err);
    TEST_ASSERT_EQUAL(5, delay_calls);
    TEST_ASSERT_TRUE(warning_logged);
}

int main(void) {
    UNITY_BEGIN();
    RUN_TEST(test_retry_eventually_succeeds);
    RUN_TEST(test_retry_warns_after_exhaustion);
    return UNITY_END();
}
