#pragma once

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

void rx_task_start(void);
void rx_task_process_packet(unsigned int run_index, const uint8_t *data, size_t length);
void rx_task_lock(void);
void rx_task_unlock(void);

uint32_t rx_task_get_frame_id(int slot_index);
const uint8_t *rx_task_get_run_buffer(int slot_index, unsigned int run_index);
bool rx_task_run_received(int slot_index, unsigned int run_index);

