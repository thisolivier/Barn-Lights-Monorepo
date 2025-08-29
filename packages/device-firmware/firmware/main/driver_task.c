#include "driver_task.h"

#include "config_autogen.h"
#include "rx_task.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/rmt.h"
#include "esp_log.h"

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

static const gpio_num_t RUN_GPIO[] = {
    RUN0_GPIO
#if RUN_COUNT > 1
    , RUN1_GPIO
#endif
#if RUN_COUNT > 2
    , RUN2_GPIO
#endif
};

_Static_assert(sizeof(RUN_GPIO) / sizeof(RUN_GPIO[0]) == RUN_COUNT,
               "RUN_COUNT mismatch");
_Static_assert(RUN_COUNT <= RMT_CHANNEL_MAX,
               "Too many runs for available RMT channels");
_Static_assert(RUN0_GPIO >= 0 && RUN0_GPIO <= 39, "RUN0_GPIO out of range");
#if RUN_COUNT > 1
_Static_assert(RUN1_GPIO >= 0 && RUN1_GPIO <= 39, "RUN1_GPIO out of range");
#endif
#if RUN_COUNT > 2
_Static_assert(RUN2_GPIO >= 0 && RUN2_GPIO <= 39, "RUN2_GPIO out of range");
#endif

static rmt_item32_t *rmt_items[RUN_COUNT];
static size_t rmt_item_count[RUN_COUNT];

static inline void encode_run(unsigned int run_index, const uint8_t *rgb_data)
{
    rmt_item32_t *items = rmt_items[run_index];
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
    for (unsigned int run = 0; run < RUN_COUNT; ++run) {
        const uint8_t *buffer = rx_task_get_run_buffer(slot_index, run);
        encode_run(run, buffer);
        rmt_fill_tx_items(run, rmt_items[run], rmt_item_count[run], 0);
    }
    for (unsigned int run = 0; run < RUN_COUNT; ++run) {
        rmt_tx_start(run, true);
    }
    for (unsigned int run = 0; run < RUN_COUNT; ++run) {
        rmt_wait_tx_done(run, pdMS_TO_TICKS(1));
    }
}

static void send_black(void)
{
    for (unsigned int run = 0; run < RUN_COUNT; ++run) {
        memset(rmt_items[run], 0, sizeof(rmt_item32_t) * rmt_item_count[run]);
        rmt_fill_tx_items(run, rmt_items[run], rmt_item_count[run], 0);
    }
    for (unsigned int run = 0; run < RUN_COUNT; ++run) {
        rmt_tx_start(run, true);
    }
    for (unsigned int run = 0; run < RUN_COUNT; ++run) {
        rmt_wait_tx_done(run, pdMS_TO_TICKS(1));
    }
}

static void driver_task(void *arg)
{
    for (unsigned int run = 0; run < RUN_COUNT; ++run) {
        rmt_config_t config = RMT_DEFAULT_CONFIG_TX(RUN_GPIO[run], run);
        config.clk_div = RMT_CLK_DIV;
        rmt_config(&config);
        rmt_driver_install(run, 0, 0);
        rmt_item_count[run] = LED_COUNT[run] * 24;
        rmt_items[run] = (rmt_item32_t *)malloc(sizeof(rmt_item32_t) * rmt_item_count[run]);
        memset(rmt_items[run], 0, sizeof(rmt_item32_t) * rmt_item_count[run]);
    }

    send_black();

    TickType_t start_tick = xTaskGetTickCount();
    uint32_t last_frame_id = 0;
    bool first_frame_sent = false;

    for (;;) {
        int selected_slot = -1;
        uint32_t selected_id = last_frame_id;
        for (int slot = 0; slot < 2; ++slot) {
            uint32_t frame_id = rx_task_get_frame_id(slot);
            if (frame_is_newer(frame_id, selected_id)) {
                bool complete = true;
                for (unsigned int run = 0; run < RUN_COUNT; ++run) {
                    if (!rx_task_run_received(slot, run)) {
                        complete = false;
                        break;
                    }
                }
                if (complete) {
                    selected_slot = slot;
                    selected_id = frame_id;
                }
            }
        }

        TickType_t now = xTaskGetTickCount();
        bool blackout_elapsed = (now - start_tick) >= pdMS_TO_TICKS(1000);
        if (selected_slot >= 0 && blackout_elapsed) {
            send_frame(selected_slot);
            last_frame_id = selected_id;
            first_frame_sent = true;
        }

        if (!first_frame_sent && blackout_elapsed && selected_slot < 0) {
            send_black();
        }

        vTaskDelay(pdMS_TO_TICKS(1));
    }
}

void driver_task_start(void)
{
    xTaskCreate(driver_task, "driver_task", 4096, NULL, 5, NULL);
}

