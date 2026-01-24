# Hardware Abstraction Layer (HAL)

This directory provides a platform abstraction layer enabling the firmware to run on both Teensy 4.1 hardware and native x86/ARM for testing.

## Architecture

The HAL defines a clean interface in `hal.h` with two implementations:

- **hal_teensy.cpp**: Real hardware implementation for Teensy 4.1
- **hal_native.cpp**: Test implementation for native builds (x86/ARM)

## Interface Overview

### Time Functions
- `uint32_t millis()`: Get milliseconds since startup
- `void delay_ms(uint32_t ms)`: Blocking delay in milliseconds
- `void delay_us(uint32_t us)`: Blocking delay in microseconds

### Network Functions
- `void network_init()`: Initialize Ethernet and UDP sockets
- `bool network_link_up()`: Check if Ethernet link is active
- `const char* network_get_ip()`: Get IP address as string
- `void network_poll(PacketCallback cb)`: Poll for incoming UDP packets
- `void network_send_udp(const char* json, size_t len)`: Send UDP heartbeat

**PacketCallback**: `void(*)(uint8_t run_index, const uint8_t* data, size_t len)`
- Called when a UDP packet arrives for a specific run

### LED Output Functions
- `void leds_init(int max_leds_per_strip)`: Initialize LED driver
- `void leds_set_pixel(int strip, int index, uint8_t r, uint8_t g, uint8_t b)`: Set pixel color
- `void leds_show()`: Trigger DMA output to all strips
- `bool leds_busy()`: Check if DMA transmission in progress

### Status LED Functions
- `void status_led_init()`: Initialize onboard LED (pin 13)
- `void status_led_set(bool on)`: Set onboard LED on/off

### Serial Functions
- `void serial_init(uint32_t baud)`: Initialize serial output for debugging
- `void serial_print(const char* str)`: Print string without newline
- `void serial_println(const char* str)`: Print string with newline

## Teensy Implementation (hal_teensy.cpp)

Real hardware implementation using:
- Arduino time functions (`millis()`, `delay()`, `delayMicroseconds()`)
- QNEthernet library for Ethernet and UDP
- OctoWS2811 library for parallel LED output via DMA
- Arduino `Serial` for debugging output
- `digitalWriteFast()` for onboard LED control

## Native Implementation (hal_native.cpp)

Test implementation providing:
- Simulated time control (can be advanced programmatically)
- Packet injection for testing receiver logic
- LED state capture for verification
- Heartbeat message capture
- Status LED state reading
- No-op serial output

### Test Interface (hal::test namespace)

Available only in `NATIVE_BUILD`:

**Time Control**:
- `void set_time(uint32_t ms)`: Set current time
- `void advance_time(uint32_t ms)`: Advance time forward

**Packet Injection**:
- `void inject_packet(uint8_t run_index, const uint8_t* data, size_t len)`: Simulate incoming UDP packet

**LED State Capture**:
- `const LedState& get_led(int strip, int index)`: Get pixel color
- `int get_show_count()`: Get number of times `leds_show()` called

**Heartbeat Capture**:
- `const std::vector<std::string>& get_sent_heartbeats()`: Get all sent heartbeat JSON strings

**Status LED State**:
- `bool get_status_led()`: Get current onboard LED state

**Reset**:
- `void reset()`: Reset all test state

## Build Configuration

The implementation is selected at build time:

- **Teensy builds**: Link with `hal_teensy.cpp` (defined by `TEENSY41` flag)
- **Native builds**: Link with `hal_native.cpp` (defined by `NATIVE_BUILD` flag)

See `platformio.ini` for build environment configuration.

## Testing Strategy

The native HAL implementation enables:
- Unit testing of firmware logic without hardware
- Deterministic time control for timing-sensitive tests
- Verification of LED output and network behavior
- Faster development iteration cycles
- CI/CD integration

## Usage Example

```cpp
#include "hal/hal.h"

void setup() {
    hal::serial_init(115200);
    hal::network_init();
    hal::leds_init(500);
    hal::status_led_init();
}

void loop() {
    hal::network_poll([](uint8_t run_index, const uint8_t* data, size_t len) {
        // Handle incoming packet
    });

    if (frame_ready) {
        hal::leds_set_pixel(0, 0, 255, 0, 0);  // Red
        hal::leds_show();
    }
}
```

## Design Principles

- Minimal interface surface area
- No platform-specific types in interface (use C standard types)
- Callback-based packet reception (avoids buffering in HAL)
- Non-blocking operations where possible
- Clean separation between firmware logic and hardware details
