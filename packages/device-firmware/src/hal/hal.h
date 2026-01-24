#pragma once

#include <cstdint>
#include <cstddef>

namespace hal {
    // Time
    uint32_t millis();
    void delay_ms(uint32_t ms);
    void delay_us(uint32_t us);

    // Network
    void network_init();
    bool network_link_up();
    const char* network_get_ip();

    // UDP receive callback type
    using PacketCallback = void(*)(uint8_t run_index, const uint8_t* data, size_t len);
    void network_poll(PacketCallback cb);
    void network_send_udp(const char* json, size_t len);

    // LED output
    void leds_init(int max_leds_per_strip);
    void leds_set_pixel(int strip, int index, uint8_t r, uint8_t g, uint8_t b);
    void leds_show();
    bool leds_busy();

    // Status LED
    void status_led_init();
    void status_led_set(bool on);

    // Serial output (for debugging)
    void serial_init(uint32_t baud);
    void serial_print(const char* str);
    void serial_println(const char* str);
}

#ifdef NATIVE_BUILD
#include <vector>
#include <string>

namespace hal::test {
    // Time control
    void set_time(uint32_t ms);
    void advance_time(uint32_t ms);

    // Packet injection
    void inject_packet(uint8_t run_index, const uint8_t* data, size_t len);

    // LED state capture
    struct LedState { uint8_t r, g, b; };
    const LedState& get_led(int strip, int index);
    int get_show_count();

    // Heartbeat capture
    const std::vector<std::string>& get_sent_heartbeats();

    // Status LED state
    bool get_status_led();

    // Reset all state
    void reset();
}
#endif
