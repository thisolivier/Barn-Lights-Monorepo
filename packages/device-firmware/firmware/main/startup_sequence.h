#ifndef STARTUP_SEQUENCE_H
#define STARTUP_SEQUENCE_H

#include <stdint.h>

#define STARTUP_RED 218
#define STARTUP_GREEN 170
#define STARTUP_BLUE 52

typedef void (*flash_run_fn)(unsigned int run_index,
                             uint8_t red, uint8_t green, uint8_t blue);
typedef void (*send_black_fn)(void);
typedef void (*delay_ms_fn)(uint32_t ms);

void startup_sequence(unsigned int run_count,
                      flash_run_fn flash_run,
                      send_black_fn send_black,
                      delay_ms_fn delay_ms);

#endif // STARTUP_SEQUENCE_H
