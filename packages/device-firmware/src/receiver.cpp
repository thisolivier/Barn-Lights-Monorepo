#include "receiver.h"
#include "config_autogen.h"
#include "led_driver.h"
#include "hal/hal.h"
#include <cstring>
#include <cstdio>

// Packet header offsets
static const size_t HEADER_SIZE = 6;
static const size_t SESSION_ID_OFFSET = 0;
static const size_t FRAME_ID_OFFSET = 2;

// Calculate total frame size (sum of all run LED counts * 3 bytes per LED)
static size_t calculate_frame_size() {
    size_t total = 0;
    for (int i = 0; i < RUN_COUNT; i++) {
        total += LED_COUNT[i] * 3;
    }
    return total;
}

// Calculate offset into frame buffer for a given run
static size_t run_offset(int run_index) {
    size_t offset = 0;
    for (int i = 0; i < run_index; i++) {
        offset += LED_COUNT[i] * 3;
    }
    return offset;
}

// Frame assembly slot
struct FrameSlot {
    uint32_t frame_id;
    uint8_t received_mask;
    bool in_use;
    uint8_t* rgb_data;  // Points into frame_buffer
};

static const int NUM_SLOTS = 2;
static FrameSlot slots[NUM_SLOTS];

// Frame buffer storage (2 slots worth)
static uint8_t* frame_buffer = nullptr;
static size_t frame_size = 0;

// Session tracking
static uint16_t current_session_id = 0;
static bool session_initialized = false;
static uint32_t last_applied_frame_id = 0;

// Statistics
static ReceiverStats stats = {0};

// Error message buffer
static char error_buffer[128];
static bool has_error = false;

// Complete frame ready for display
static const uint8_t* complete_frame = nullptr;

// Helper: check if frame_id a is newer than b (handles wraparound)
static bool newer(uint32_t a, uint32_t b) {
    return (int32_t)(a - b) > 0;
}

// Parse big-endian uint16
static uint16_t read_u16_be(const uint8_t* data) {
    return (data[0] << 8) | data[1];
}

// Parse big-endian uint32
static uint32_t read_u32_be(const uint8_t* data) {
    return ((uint32_t)data[0] << 24) | ((uint32_t)data[1] << 16) |
           ((uint32_t)data[2] << 8) | data[3];
}

void receiver_init() {
    frame_size = calculate_frame_size();

    // Free old buffer if re-initializing
    if (frame_buffer != nullptr) {
        delete[] frame_buffer;
    }

    // Allocate buffer for 2 frame slots
    frame_buffer = new uint8_t[frame_size * NUM_SLOTS];
    memset(frame_buffer, 0, frame_size * NUM_SLOTS);

    // Initialize slots
    for (int i = 0; i < NUM_SLOTS; i++) {
        slots[i].frame_id = 0;
        slots[i].received_mask = 0;
        slots[i].in_use = false;
        slots[i].rgb_data = frame_buffer + (i * frame_size);
    }

    // Reset session tracking
    current_session_id = 0;
    session_initialized = false;
    last_applied_frame_id = 0;
    complete_frame = nullptr;

    // Reset stats and error
    stats = {0};
    has_error = false;
}

static void clear_slots() {
    for (int i = 0; i < NUM_SLOTS; i++) {
        slots[i].frame_id = 0;
        slots[i].received_mask = 0;
        slots[i].in_use = false;
        memset(slots[i].rgb_data, 0, frame_size);
    }
}

static FrameSlot* find_or_allocate_slot(uint32_t frame_id) {
    // First, look for existing slot with this frame_id
    for (int i = 0; i < NUM_SLOTS; i++) {
        if (slots[i].in_use && slots[i].frame_id == frame_id) {
            return &slots[i];
        }
    }

    // Look for an empty slot
    for (int i = 0; i < NUM_SLOTS; i++) {
        if (!slots[i].in_use) {
            slots[i].frame_id = frame_id;
            slots[i].received_mask = 0;
            slots[i].in_use = true;
            memset(slots[i].rgb_data, 0, frame_size);
            return &slots[i];
        }
    }

    // All slots in use - evict the oldest (lowest frame_id considering wraparound)
    int oldest_idx = 0;
    for (int i = 1; i < NUM_SLOTS; i++) {
        if (newer(slots[oldest_idx].frame_id, slots[i].frame_id)) {
            oldest_idx = i;
        }
    }

    slots[oldest_idx].frame_id = frame_id;
    slots[oldest_idx].received_mask = 0;
    slots[oldest_idx].in_use = true;
    memset(slots[oldest_idx].rgb_data, 0, frame_size);
    return &slots[oldest_idx];
}

void receiver_handle_packet(uint8_t run_index, const uint8_t* data, size_t len) {
    stats.rx_frames++;

    // Validate run index
    if (run_index >= RUN_COUNT) {
        stats.drops_len++;
        return;
    }

    // Validate packet length
    size_t expected_len = HEADER_SIZE + LED_COUNT[run_index] * 3;
    if (len != expected_len) {
        stats.drops_len++;
        return;
    }

    // Parse header
    uint16_t session_id = read_u16_be(data + SESSION_ID_OFFSET);
    uint32_t frame_id = read_u32_be(data + FRAME_ID_OFFSET);
    const uint8_t* rgb_data = data + HEADER_SIZE;

    // Handle session change
    if (!session_initialized || session_id != current_session_id) {
        snprintf(error_buffer, sizeof(error_buffer),
                 "%lu: session change %u -> %u",
                 (unsigned long)hal::millis(), current_session_id, session_id);
        has_error = true;

        current_session_id = session_id;
        session_initialized = true;
        last_applied_frame_id = 0;
        clear_slots();
    }

    // Check for stale frame (but allow frame_id 0 when starting fresh)
    if (last_applied_frame_id != 0 && !newer(frame_id, last_applied_frame_id)) {
        stats.drops_stale++;
        return;
    }

    // Find or allocate slot for this frame
    FrameSlot* slot = find_or_allocate_slot(frame_id);

    // Copy RGB data to slot
    size_t offset = run_offset(run_index);
    memcpy(slot->rgb_data + offset, rgb_data, LED_COUNT[run_index] * 3);

    // Set bit in received mask
    slot->received_mask |= (1 << run_index);

    // Check if frame is complete
    if (slot->received_mask == EXPECTED_MASK) {
        stats.complete_frames++;

        // Check if this is newer than last applied (or first frame)
        if (last_applied_frame_id == 0 || newer(frame_id, last_applied_frame_id)) {
            // Mark frame ready for display
            complete_frame = slot->rgb_data;
            last_applied_frame_id = frame_id;
        }

        // Clear the slot
        slot->in_use = false;
        slot->received_mask = 0;
    }
}

const uint8_t* receiver_get_complete_frame() {
    const uint8_t* frame = complete_frame;
    complete_frame = nullptr;

    if (frame != nullptr) {
        stats.applied_frames++;
    }

    return frame;
}

ReceiverStats receiver_get_and_reset_stats() {
    ReceiverStats result = stats;
    stats = {0};
    return result;
}

const char* receiver_get_last_error() {
    return has_error ? error_buffer : nullptr;
}

void receiver_clear_last_error() {
    has_error = false;
}
