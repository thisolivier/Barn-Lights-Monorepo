#include "startup_sequence.h"

void startup_sequence(unsigned int run_count,
                      flash_run_fn flash_run,
                      send_black_fn send_black,
                      delay_ms_fn delay_ms)
{
    delay_ms(1000);
    for (unsigned int run = 0; run < run_count; ++run) {
        flash_run(run, STARTUP_RED, STARTUP_GREEN, STARTUP_BLUE);
        delay_ms(1000);
        send_black();
    }
}

