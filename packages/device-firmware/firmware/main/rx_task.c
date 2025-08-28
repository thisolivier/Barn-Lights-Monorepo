#include "rx_task.h"

#include "config_autogen.h"

#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#ifndef UNIT_TEST
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lwip/sockets.h"
#include "esp_log.h"
#endif

#ifndef PORT_BASE
#define PORT_BASE 49600
#endif

typedef struct {
    uint32_t frame_id;
    bool run_received[RUN_COUNT];
} FrameSlot;

static FrameSlot frame_slots[2];
static uint8_t **frame_buffers[2];
static int current_slot_index = 0;

static bool frame_is_newer(uint32_t a, uint32_t b) {
    return (int32_t)(a - b) > 0;
}

static void allocate_buffers(void) {
    for (int slot = 0; slot < 2; ++slot) {
        frame_buffers[slot] = (uint8_t **)malloc(sizeof(uint8_t *) * RUN_COUNT);
        for (int run = 0; run < RUN_COUNT; ++run) {
            frame_buffers[slot][run] = (uint8_t *)malloc(LED_COUNT[run] * 3);
        }
    }
}

static void clear_slot(FrameSlot *slot) {
    slot->frame_id = 0;
    for (int run = 0; run < RUN_COUNT; ++run) {
        slot->run_received[run] = false;
    }
}

void rx_task_process_packet(unsigned int run_index, const uint8_t *data, size_t length) {
    if (run_index >= RUN_COUNT) {
        return;
    }
    size_t expected_length = LED_COUNT[run_index] * 3 + 4;
    if (length != expected_length) {
        return;
    }
    uint32_t frame_id = ((uint32_t)data[0] << 24) |
                        ((uint32_t)data[1] << 16) |
                        ((uint32_t)data[2] << 8) |
                        (uint32_t)data[3];

    FrameSlot *current_slot = &frame_slots[current_slot_index];
    FrameSlot *next_slot = &frame_slots[1 - current_slot_index];
    FrameSlot *target_slot = NULL;

    if (frame_id == current_slot->frame_id || current_slot->frame_id == 0) {
        current_slot->frame_id = frame_id;
        target_slot = current_slot;
    } else if (frame_id == next_slot->frame_id) {
        target_slot = next_slot;
    } else if (frame_is_newer(frame_id, current_slot->frame_id)) {
        if (next_slot->frame_id == 0 || frame_is_newer(next_slot->frame_id, frame_id)) {
            clear_slot(next_slot);
            next_slot->frame_id = frame_id;
            target_slot = next_slot;
        } else {
            return;
        }
    } else {
        return;
    }

    const uint8_t *src = data + 4;
    uint8_t *dest = frame_buffers[target_slot == current_slot ? current_slot_index : 1 - current_slot_index][run_index];
    for (unsigned int i = 0; i < LED_COUNT[run_index]; ++i) {
        uint8_t red = src[i * 3];
        uint8_t green = src[i * 3 + 1];
        uint8_t blue = src[i * 3 + 2];
        dest[i * 3] = green;
        dest[i * 3 + 1] = red;
        dest[i * 3 + 2] = blue;
    }
    target_slot->run_received[run_index] = true;

    bool complete = true;
    for (int run = 0; run < RUN_COUNT; ++run) {
        if (!target_slot->run_received[run]) {
            complete = false;
            break;
        }
    }
    if (target_slot == next_slot && complete) {
        current_slot_index = 1 - current_slot_index;
        clear_slot(&frame_slots[1 - current_slot_index]);
    }
}

#ifndef UNIT_TEST
static void udp_listener_task(void *param) {
    unsigned int run_index = (unsigned int)(uintptr_t)param;
    int sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_addr.s_addr = htonl(INADDR_ANY),
        .sin_port = htons(PORT_BASE + run_index),
    };
    bind(sock, (struct sockaddr *)&addr, sizeof(addr));
    size_t buffer_length = LED_COUNT[run_index] * 3 + 4;
    uint8_t *buffer = (uint8_t *)malloc(buffer_length);
    for (;;) {
        ssize_t received = recvfrom(sock, buffer, buffer_length, 0, NULL, NULL);
        if (received > 0) {
            rx_task_process_packet(run_index, buffer, (size_t)received);
        }
    }
}
#endif

void rx_task_start(void) {
    allocate_buffers();
    clear_slot(&frame_slots[0]);
    clear_slot(&frame_slots[1]);
#ifndef UNIT_TEST
    for (unsigned int run = 0; run < RUN_COUNT; ++run) {
        xTaskCreate(udp_listener_task, "rx_run", 4096, (void *)(uintptr_t)run, 5, NULL);
    }
#endif
}

#ifdef UNIT_TEST
uint32_t rx_task_get_frame_id(int slot_index) {
    if (slot_index < 0 || slot_index > 1) {
        return 0;
    }
    return frame_slots[slot_index].frame_id;
}

const uint8_t *rx_task_get_run_buffer(int slot_index, unsigned int run_index) {
    if (slot_index < 0 || slot_index > 1 || run_index >= RUN_COUNT) {
        return NULL;
    }
    return frame_buffers[slot_index][run_index];
}

bool rx_task_run_received(int slot_index, unsigned int run_index) {
    if (slot_index < 0 || slot_index > 1 || run_index >= RUN_COUNT) {
        return false;
    }
    return frame_slots[slot_index].run_received[run_index];
}
#endif

