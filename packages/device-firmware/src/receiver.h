#pragma once

#include <cstdint>
#include <cstddef>

// Initialize receiver state and allocate frame assembly buffers
void receiver_init();

// Handle an incoming UDP packet for a specific run
void receiver_handle_packet(uint8_t run_index, const uint8_t* data, size_t len);

// Get pointer to complete frame data if available, nullptr otherwise
// Returns pointer to RGB data: run0[LED_COUNT[0]*3], run1[LED_COUNT[1]*3], ...
const uint8_t* receiver_get_complete_frame();

// Statistics (reset after each heartbeat)
struct ReceiverStats {
    uint32_t rx_frames;       // Packets received
    uint32_t complete_frames; // Frames fully assembled
    uint32_t applied_frames;  // Frames applied to display
    uint32_t drops_len;       // Dropped due to length mismatch
    uint32_t drops_stale;     // Dropped due to stale frame_id
};

// Get current stats and reset counters
ReceiverStats receiver_get_and_reset_stats();

// Get last error message (for heartbeat), nullptr if none
const char* receiver_get_last_error();

// Clear the last error after including in heartbeat
void receiver_clear_last_error();
