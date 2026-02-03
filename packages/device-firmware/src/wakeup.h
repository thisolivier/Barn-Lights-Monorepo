#pragma once

// Initialize the wakeup effect state
void wakeup_init();

// Poll the wakeup effect state machine
// Call from main loop - handles timing and LED updates
void wakeup_poll();

// Check if wakeup effect is complete
// Returns true once all runs have been lit and turned off
bool wakeup_is_complete();
