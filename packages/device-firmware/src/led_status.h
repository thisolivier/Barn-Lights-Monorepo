#pragma once

// Initialize onboard LED status indicator
void led_status_init();

// Poll LED status (call every loop iteration)
void led_status_poll();

// Notify that a frame was displayed (for activity indication)
void led_status_frame_displayed();
