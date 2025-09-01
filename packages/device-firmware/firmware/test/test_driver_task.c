#include "unity.h"
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef int esp_err_t;
#define ESP_OK 0
#define ESP_ERR_TIMEOUT 0x105

typedef void *rmt_channel_handle_t;
typedef void *rmt_encoder_handle_t;
typedef int TickType_t;

#define pdMS_TO_TICKS(ms) (ms)

typedef struct {
    uint32_t duration0;
    uint32_t level0;
    uint32_t duration1;
    uint32_t level1;
} rmt_symbol_word_t;

typedef struct {
    int loop_count;
} rmt_transmit_config_t;

#define RUN_COUNT 1
static const unsigned int LED_COUNT[RUN_COUNT] = {3};

#define RMT_T0H_TICKS 16
#define RMT_T0L_TICKS 34
#define RMT_T1H_TICKS 32
#define RMT_T1L_TICKS 18

static rmt_symbol_word_t *rmt_items[RUN_COUNT];
static size_t rmt_item_count[RUN_COUNT];
static rmt_channel_handle_t rmt_channels[RUN_COUNT];
static rmt_encoder_handle_t copy_encoder;
static const rmt_transmit_config_t TRANSMIT_CONFIG = {0};

static const rmt_symbol_word_t *last_transmit_src;
static size_t last_transmit_size;
static esp_err_t rmt_transmit(rmt_channel_handle_t channel, rmt_encoder_handle_t encoder,
                              const void *src, size_t size,
                              const rmt_transmit_config_t *config) {
    (void)channel;
    (void)encoder;
    (void)config;
    last_transmit_src = (const rmt_symbol_word_t *)src;
    last_transmit_size = size;
    return ESP_OK;
}

static void ets_delay_us(uint32_t microseconds) {
    (void)microseconds;
}

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

static inline void encode_run(unsigned int run_index, const uint8_t *rgb_data)
{
    rmt_symbol_word_t *items = rmt_items[run_index];
    size_t item_index = 0;
    for (unsigned int led_index = 0; led_index < LED_COUNT[run_index]; ++led_index) {
        uint8_t red = rgb_data[led_index * 3];
        uint8_t green = rgb_data[led_index * 3 + 1];
        uint8_t blue = rgb_data[led_index * 3 + 2];
        uint8_t grb[3] = {green, red, blue};
        for (int color_index = 0; color_index < 3; ++color_index) {
            uint8_t value = grb[color_index];
            for (int bit_index = 7; bit_index >= 0; --bit_index) {
                bool bit_set = value & (1 << bit_index);
                items[item_index].duration0 = bit_set ? RMT_T1H_TICKS : RMT_T0H_TICKS;
                items[item_index].level0 = 1;
                items[item_index].duration1 = bit_set ? RMT_T1L_TICKS : RMT_T0L_TICKS;
                items[item_index].level1 = 0;
                ++item_index;
            }
        }
    }
}

static void send_black(void)
{
    for (unsigned int run_index = 0; run_index < RUN_COUNT; ++run_index) {
        size_t led_count = LED_COUNT[run_index];
        size_t byte_count = led_count * 3;
        uint8_t *zero_buffer = (uint8_t *)calloc(byte_count, 1);
        encode_run(run_index, zero_buffer);
        free(zero_buffer);
        rmt_transmit(rmt_channels[run_index], copy_encoder,
                     rmt_items[run_index],
                     sizeof(rmt_symbol_word_t) * rmt_item_count[run_index],
                     &TRANSMIT_CONFIG);
        wait_all_done_retry(rmt_channels[run_index]);
        ets_delay_us(60);
    }
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

void test_send_black_matches_zero_frame(void) {
    rmt_item_count[0] = LED_COUNT[0] * 24;
    rmt_symbol_word_t *expected_items =
        (rmt_symbol_word_t *)malloc(sizeof(rmt_symbol_word_t) * rmt_item_count[0]);
    rmt_items[0] = expected_items;
    size_t byte_count = LED_COUNT[0] * 3;
    uint8_t *zero_buffer = (uint8_t *)calloc(byte_count, 1);
    encode_run(0, zero_buffer);
    free(zero_buffer);
    rmt_symbol_word_t *output_items =
        (rmt_symbol_word_t *)malloc(sizeof(rmt_symbol_word_t) * rmt_item_count[0]);
    rmt_items[0] = output_items;
    wait_failures = 0;
    warning_logged = false;
    delay_calls = 0;
    send_black();
    TEST_ASSERT_EQUAL_MEMORY(expected_items, output_items,
                             sizeof(rmt_symbol_word_t) * rmt_item_count[0]);
    TEST_ASSERT_EQUAL(sizeof(rmt_symbol_word_t) * rmt_item_count[0], last_transmit_size);
    TEST_ASSERT_EQUAL_PTR(output_items, last_transmit_src);
    free(expected_items);
    free(output_items);
}

void test_long_frame_transmitted_completely(void) {
    rmt_item_count[0] = LED_COUNT[0] * 24;
    rmt_symbol_word_t *frame_items =
        (rmt_symbol_word_t *)malloc(sizeof(rmt_symbol_word_t) * rmt_item_count[0]);
    rmt_items[0] = frame_items;
    size_t byte_count = LED_COUNT[0] * 3;
    uint8_t *pattern_buffer = (uint8_t *)malloc(byte_count);
    for (size_t byte_index = 0; byte_index < byte_count; ++byte_index) {
        pattern_buffer[byte_index] = (uint8_t)byte_index;
    }
    encode_run(0, pattern_buffer);
    free(pattern_buffer);
    last_transmit_src = NULL;
    last_transmit_size = 0;
    rmt_transmit(rmt_channels[0], copy_encoder, rmt_items[0],
                 sizeof(rmt_symbol_word_t) * rmt_item_count[0],
                 &TRANSMIT_CONFIG);
    TEST_ASSERT_TRUE(rmt_item_count[0] > 64);
    TEST_ASSERT_EQUAL(sizeof(rmt_symbol_word_t) * rmt_item_count[0],
                      last_transmit_size);
    TEST_ASSERT_EQUAL_PTR(rmt_items[0], last_transmit_src);
    rmt_symbol_word_t tail_symbol = rmt_items[0][rmt_item_count[0] - 1];
    TEST_ASSERT_EQUAL_UINT32(RMT_T0H_TICKS, tail_symbol.duration0);
    TEST_ASSERT_EQUAL_UINT32(1, tail_symbol.level0);
    TEST_ASSERT_EQUAL_UINT32(RMT_T0L_TICKS, tail_symbol.duration1);
    TEST_ASSERT_EQUAL_UINT32(0, tail_symbol.level1);
    free(frame_items);
}

int main(void) {
    UNITY_BEGIN();
    RUN_TEST(test_retry_eventually_succeeds);
    RUN_TEST(test_retry_warns_after_exhaustion);
    RUN_TEST(test_send_black_matches_zero_frame);
    RUN_TEST(test_long_frame_transmitted_completely);
    return UNITY_END();
}
