#pragma once

#include <cstdint>
#include <cstddef>

// Initialize OctoWS2811 driver
void driver_init();

// Display a complete frame (RGB data for all runs concatenated)
// Frame layout: run0[LED_COUNT[0]*3], run1[LED_COUNT[1]*3], ...
void driver_show_frame(const uint8_t* frame_data);

// Set all LEDs to black
void driver_show_black();

// Check if DMA is still transmitting
bool driver_is_busy();

// Check if startup blackout period has elapsed
bool driver_ready_for_frames();
