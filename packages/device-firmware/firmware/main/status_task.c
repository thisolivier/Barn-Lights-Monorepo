#include "status_task.h"
#include "config_autogen.h"

#include <stdio.h>
#include <string.h>

#ifndef SENDER_IP_ADDR0
#define SENDER_IP_ADDR0 10
#define SENDER_IP_ADDR1 10
#define SENDER_IP_ADDR2 0
#define SENDER_IP_ADDR3 1
#endif

#ifndef STATUS_PORT
#define STATUS_PORT 49700
#endif

#if SIDE_ID == 0
#define SIDE_ID_STR "LEFT"
#else
#define SIDE_ID_STR "RIGHT"
#endif

static uint32_t rx_frames_count;
static uint32_t complete_count;
static uint32_t applied_count;
static uint32_t dropped_count;

void status_task_increment_rx_frames(void) { rx_frames_count++; }
void status_task_increment_complete(void) { complete_count++; }
void status_task_increment_applied(void) { applied_count++; }
void status_task_increment_drops(void) { dropped_count++; }
void status_task_reset_counters(void) {
    rx_frames_count = 0;
    complete_count = 0;
    applied_count = 0;
    dropped_count = 0;
}

size_t status_task_format_json(char *buffer, size_t buffer_len, uint32_t uptime_ms, bool link) {
    char ip_str[16];
    snprintf(ip_str, sizeof(ip_str), "%u.%u.%u.%u", STATIC_IP_ADDR0, STATIC_IP_ADDR1, STATIC_IP_ADDR2, STATIC_IP_ADDR3);
    size_t offset = 0;
    offset += snprintf(buffer + offset, buffer_len - offset,
                       "{\"id\":\"%s\",\"ip\":\"%s\",\"uptime_ms\":%u,\"link\":%s,\"runs\":%u,\"leds\":[",
                       SIDE_ID_STR, ip_str, uptime_ms, link ? "true" : "false", RUN_COUNT);
    for (unsigned int i = 0; i < RUN_COUNT; ++i) {
        offset += snprintf(buffer + offset, buffer_len - offset, "%u", LED_COUNT[i]);
        if (i + 1 < RUN_COUNT) {
            offset += snprintf(buffer + offset, buffer_len - offset, ",");
        }
    }
    offset += snprintf(buffer + offset, buffer_len - offset,
                       "],\"rx_frames\":%u,\"complete\":%u,\"applied\":%u,\"dropped_frames\":%u,\"errors\":[]}",
                       rx_frames_count, complete_count, applied_count, dropped_count);
    return offset;
}

#ifndef UNIT_TEST
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lwip/inet.h"
#include "lwip/sockets.h"
#include "esp_timer.h"

static void status_task(void *param) {
    int sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    struct sockaddr_in dest = {
        .sin_family = AF_INET,
        .sin_port = htons(STATUS_PORT),
        .sin_addr.s_addr = htonl(((uint32_t)SENDER_IP_ADDR0 << 24) |
                                 ((uint32_t)SENDER_IP_ADDR1 << 16) |
                                 ((uint32_t)SENDER_IP_ADDR2 << 8) |
                                 (uint32_t)SENDER_IP_ADDR3),
    };
    char json[256];
    for (;;) {
        uint32_t uptime_ms = (uint32_t)(esp_timer_get_time() / 1000);
        status_task_format_json(json, sizeof(json), uptime_ms, true);
        sendto(sock, json, strlen(json), 0, (struct sockaddr *)&dest, sizeof(dest));
        status_task_reset_counters();
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

void status_task_start(void) {
    xTaskCreate(status_task, "status_task", 4096, NULL, 5, NULL);
}
#else
void status_task_start(void) {}
#endif
