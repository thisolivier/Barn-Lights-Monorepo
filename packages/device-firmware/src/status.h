#pragma once

// Initialize status module, record startup time
void status_init();

// Poll for heartbeat interval, send if 1s elapsed
void status_poll();
