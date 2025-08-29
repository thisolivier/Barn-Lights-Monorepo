#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

void status_task_start(void);

void status_task_increment_rx_frames(void);
void status_task_increment_complete(void);
void status_task_increment_applied(void);
void status_task_increment_drops(void);
void status_task_reset_counters(void);

size_t status_task_format_json(char *buffer, size_t buffer_len, uint32_t uptime_ms, bool link);
