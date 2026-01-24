#include "status.h"
#include "config_autogen.h"
#include "network.h"
#include "receiver.h"
#include "hal/hal.h"
#include <cstdio>

static const uint32_t HEARTBEAT_INTERVAL_MS = 1000;
static uint32_t startup_time_ms = 0;
static uint32_t last_heartbeat_ms = 0;

// JSON buffer (spec says <=256 bytes)
static char json_buffer[512];

void status_init() {
    startup_time_ms = hal::millis();
    last_heartbeat_ms = hal::millis();
}

void status_poll() {
    uint32_t now = hal::millis();

    if (now - last_heartbeat_ms < HEARTBEAT_INTERVAL_MS) {
        return;
    }
    last_heartbeat_ms = now;

    // Get stats from receiver
    ReceiverStats stats = receiver_get_and_reset_stats();

    // Get error message if any
    const char* error = receiver_get_last_error();

    // Build JSON heartbeat
    // Format: {"id":"LEFT","ip":"10.10.0.2","uptime_ms":123456,...}

    int pos = 0;

    pos += snprintf(json_buffer + pos, sizeof(json_buffer) - pos,
                    "{\"id\":\"%s\",\"ip\":\"%s\",\"uptime_ms\":%lu,\"link\":%s,\"runs\":%d,\"leds\":[",
                    SIDE_ID,
                    network_get_ip_string(),
                    (unsigned long)(now - startup_time_ms),
                    network_link_up() ? "true" : "false",
                    RUN_COUNT);

    // LED counts array
    for (int i = 0; i < RUN_COUNT; i++) {
        if (i > 0) {
            pos += snprintf(json_buffer + pos, sizeof(json_buffer) - pos, ",");
        }
        pos += snprintf(json_buffer + pos, sizeof(json_buffer) - pos, "%d", LED_COUNT[i]);
    }

    pos += snprintf(json_buffer + pos, sizeof(json_buffer) - pos,
                    "],\"rx_frames\":%lu,\"complete\":%lu,\"applied\":%lu,\"dropped_frames\":%lu,\"errors\":[",
                    (unsigned long)stats.rx_frames,
                    (unsigned long)stats.complete_frames,
                    (unsigned long)stats.applied_frames,
                    (unsigned long)(stats.drops_len + stats.drops_stale));

    // Error array
    if (error != nullptr) {
        // Escape any quotes in error message
        pos += snprintf(json_buffer + pos, sizeof(json_buffer) - pos, "\"");
        for (const char* p = error; *p && pos < (int)sizeof(json_buffer) - 10; p++) {
            if (*p == '"' || *p == '\\') {
                json_buffer[pos++] = '\\';
            }
            json_buffer[pos++] = *p;
        }
        pos += snprintf(json_buffer + pos, sizeof(json_buffer) - pos, "\"");
        receiver_clear_last_error();
    }

    pos += snprintf(json_buffer + pos, sizeof(json_buffer) - pos, "]}");

    // Send heartbeat
    network_send_status(json_buffer, pos);
}
