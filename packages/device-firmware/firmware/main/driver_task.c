#include "driver_task.h"

#include "config_autogen.h"
#include "rx_task.h"
#include "status_task.h"
#include "startup_sequence.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/rmt_tx.h"
#include "driver/rmt_encoder.h"
#include "soc/soc_caps.h"

#include <stdlib.h>
#include <string.h>

#define RMT_CLK_DIV 2
#define RMT_TICKS_PER_BIT (80000000 / RMT_CLK_DIV / 800000)
_Static_assert(RMT_TICKS_PER_BIT == 50, "Unexpected RMT bit timing");

#define RMT_T0H_TICKS 16
#define RMT_T0L_TICKS (RMT_TICKS_PER_BIT - RMT_T0H_TICKS)
#define RMT_T1H_TICKS 32
#define RMT_T1L_TICKS (RMT_TICKS_PER_BIT - RMT_T1H_TICKS)
_Static_assert(RMT_T0H_TICKS + RMT_T0L_TICKS == RMT_TICKS_PER_BIT, "T0 timing");
_Static_assert(RMT_T1H_TICKS + RMT_T1L_TICKS == RMT_TICKS_PER_BIT, "T1 timing");

#define RUN0_GPIO 12
#define RUN1_GPIO 13
#define RUN2_GPIO 14
#define RUN3_GPIO 15

static const gpio_num_t RUN_GPIO[] = {
    RUN0_GPIO
#if RUN_COUNT > 1
    , RUN1_GPIO
#endif
#if RUN_COUNT > 2
    , RUN2_GPIO
#endif
#if RUN_COUNT > 3
    , RUN3_GPIO
#endif
};

_Static_assert(sizeof(RUN_GPIO) / sizeof(RUN_GPIO[0]) == RUN_COUNT,
               "RUN_COUNT mismatch");
_Static_assert(RUN_COUNT <= SOC_RMT_CHANNELS_PER_GROUP,
               "Too many runs for available RMT channels");
_Static_assert(RUN_COUNT <= 4, "RUN_COUNT exceeds supported maximum (4)");
_Static_assert(RUN0_GPIO >= 0 && RUN0_GPIO <= 39, "RUN0_GPIO out of range");
#if RUN_COUNT > 1
_Static_assert(RUN1_GPIO >= 0 && RUN1_GPIO <= 39, "RUN1_GPIO out of range");
#endif
#if RUN_COUNT > 2
_Static_assert(RUN2_GPIO >= 0 && RUN2_GPIO <= 39, "RUN2_GPIO out of range");
#endif
#if RUN_COUNT > 3
_Static_assert(RUN3_GPIO >= 0 && RUN3_GPIO <= 39, "RUN3_GPIO out of range");
#endif


static rmt_symbol_word_t *rmt_items[RUN_COUNT];
static size_t rmt_item_count[RUN_COUNT];
static rmt_channel_handle_t rmt_channels[RUN_COUNT];
static rmt_encoder_handle_t copy_encoder;
static const rmt_transmit_config_t TRANSMIT_CONFIG = {
    .loop_count = 0,
};

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
    ESP_LOGW("driver_task", "rmt_tx_wait_all_done timeout");
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
        for (int color = 0; color < 3; ++color) {
            uint8_t value = grb[color];
            for (int bit = 7; bit >= 0; --bit) {
                bool bit_set = value & (1 << bit);
                items[item_index].duration0 = bit_set ? RMT_T1H_TICKS : RMT_T0H_TICKS;
                items[item_index].level0 = 1;
                items[item_index].duration1 = bit_set ? RMT_T1L_TICKS : RMT_T0L_TICKS;
                items[item_index].level1 = 0;
                ++item_index;
            }
        }
    }
}

static bool frame_is_newer(uint32_t a, uint32_t b)
{
    return (int32_t)(a - b) > 0;
}

static void send_frame(int slot_index)
{
    // Protect buffers while we read/encode
    rx_task_lock();
    for (unsigned int run = 0; run < RUN_COUNT; ++run) {
        const uint8_t *buffer = rx_task_get_run_buffer(slot_index, run);
        encode_run(run, buffer); // fills rmt_items[run] / rmt_item_count[run]
    }
    rx_task_unlock();

    // Transmit each run sequentially
    for (unsigned int run = 0; run < RUN_COUNT; ++run) {
        ESP_ERROR_CHECK(rmt_transmit(
            rmt_channels[run],
            copy_encoder,
            rmt_items[run],
            sizeof(rmt_symbol_word_t) * rmt_item_count[run],
            &TRANSMIT_CONFIG));
        wait_all_done_retry(rmt_channels[run]);
    }
}


static void send_black(void)
{
    for (unsigned int run = 0; run < RUN_COUNT; ++run) {
        memset(rmt_items[run], 0, sizeof(rmt_symbol_word_t) * rmt_item_count[run]);
        ESP_ERROR_CHECK(rmt_transmit(rmt_channels[run], copy_encoder,
                                     rmt_items[run],
                                     sizeof(rmt_symbol_word_t) * rmt_item_count[run],
                                     &TRANSMIT_CONFIG));
        wait_all_done_retry(rmt_channels[run]);
    }
}

static void flash_run(unsigned int run_index,
                      uint8_t red, uint8_t green, uint8_t blue)
{
    size_t led_count = LED_COUNT[run_index];
    size_t byte_count = led_count * 3;
    uint8_t *rgb_buffer = (uint8_t *)malloc(byte_count);
    for (unsigned int led = 0; led < led_count; ++led) {
        rgb_buffer[led * 3] = red;
        rgb_buffer[led * 3 + 1] = green;
        rgb_buffer[led * 3 + 2] = blue;
    }
    encode_run(run_index, rgb_buffer);
    free(rgb_buffer);
    ESP_ERROR_CHECK(rmt_transmit(rmt_channels[run_index], copy_encoder,
                                 rmt_items[run_index],
                                 sizeof(rmt_symbol_word_t) * rmt_item_count[run_index],
                                 &TRANSMIT_CONFIG));
    wait_all_done_retry(rmt_channels[run_index]);
}

static void delay_ms(uint32_t ms)
{
    vTaskDelay(pdMS_TO_TICKS(ms));
}

static void driver_task(void *arg)
{
    rmt_copy_encoder_config_t copy_config = {};
    ESP_ERROR_CHECK(rmt_new_copy_encoder(&copy_config, &copy_encoder));

    for (unsigned int run = 0; run < RUN_COUNT; ++run) {
        rmt_tx_channel_config_t channel_config = {
            .gpio_num = RUN_GPIO[run],
            .clk_src = RMT_CLK_SRC_DEFAULT,
            .resolution_hz = 80000000 / RMT_CLK_DIV,
            .mem_block_symbols = 64,
            .trans_queue_depth = 1,
        };
        ESP_ERROR_CHECK(rmt_new_tx_channel(&channel_config, &rmt_channels[run]));
        ESP_ERROR_CHECK(rmt_enable(rmt_channels[run]));
        rmt_item_count[run] = LED_COUNT[run] * 24;
        rmt_items[run] = (rmt_symbol_word_t *)malloc(sizeof(rmt_symbol_word_t) * rmt_item_count[run]);
        memset(rmt_items[run], 0, sizeof(rmt_symbol_word_t) * rmt_item_count[run]);
    }

    send_black();
    startup_sequence(RUN_COUNT, flash_run, send_black, delay_ms);

    uint32_t last_frame_id = 0;

    for (;;) {
        int selected_slot = -1;
        uint32_t selected_id = last_frame_id;
        rx_task_lock();
        for (int slot = 0; slot < 2; ++slot) {
            uint32_t frame_id = rx_task_get_frame_id(slot);
            if (frame_is_newer(frame_id, selected_id)) {
                bool frame_complete = true;
                for (unsigned int run = 0; run < RUN_COUNT; ++run) {
                    if (!rx_task_run_received(slot, run)) {
                        frame_complete = false;
                        break;
                    }
                }
                if (frame_complete) {
                    selected_slot = slot;
                    selected_id = frame_id;
                }
            }
        }
        rx_task_unlock();

        if (selected_slot >= 0) {
            send_frame(selected_slot);
            status_task_increment_applied();
            last_frame_id = selected_id;
        }

        vTaskDelay(pdMS_TO_TICKS(1));
    }
}

void driver_task_start(void)
{
    xTaskCreate(driver_task, "driver_task", 4096, NULL, 5, NULL);
}

