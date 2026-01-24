#ifdef NATIVE_BUILD

#include "hal.h"
#include <vector>
#include <string>
#include <queue>
#include <cstring>

// Simulated state
static uint32_t simulated_time_ms = 0;
static bool link_up = true;
static char ip_string[] = "10.10.0.3";
static bool status_led_state = false;

// LED state
static int max_leds = 0;
static const int NUM_STRIPS = 8;
static std::vector<hal::test::LedState> led_buffer;
static int show_count = 0;

// Packet queue for injection
struct InjectedPacket {
    uint8_t run_index;
    std::vector<uint8_t> data;
};
static std::queue<InjectedPacket> packet_queue;

// Heartbeat capture
static std::vector<std::string> sent_heartbeats;

namespace hal {

// Time functions
uint32_t millis() {
    return simulated_time_ms;
}

void delay_ms(uint32_t ms) {
    simulated_time_ms += ms;
}

void delay_us(uint32_t us) {
    // For native testing, just advance time slightly
    // (microseconds don't matter much in tests)
    if (us >= 1000) {
        simulated_time_ms += us / 1000;
    }
}

// Network functions
void network_init() {
    // Nothing to do in native mode
}

bool network_link_up() {
    return link_up;
}

const char* network_get_ip() {
    return ip_string;
}

void network_poll(PacketCallback cb) {
    while (!packet_queue.empty() && cb != nullptr) {
        InjectedPacket& pkt = packet_queue.front();
        cb(pkt.run_index, pkt.data.data(), pkt.data.size());
        packet_queue.pop();
    }
}

void network_send_udp(const char* json, size_t len) {
    sent_heartbeats.emplace_back(json, len);
}

// LED functions
void leds_init(int max_leds_per_strip) {
    max_leds = max_leds_per_strip;
    led_buffer.resize(NUM_STRIPS * max_leds);
    for (auto& led : led_buffer) {
        led = {0, 0, 0};
    }
    show_count = 0;
}

void leds_set_pixel(int strip, int index, uint8_t r, uint8_t g, uint8_t b) {
    if (strip < 0 || strip >= NUM_STRIPS || index < 0 || index >= max_leds) {
        return;
    }
    led_buffer[strip * max_leds + index] = {r, g, b};
}

void leds_show() {
    show_count++;
}

bool leds_busy() {
    return false;
}

// Status LED functions
void status_led_init() {
    status_led_state = false;
}

void status_led_set(bool on) {
    status_led_state = on;
}

// Serial functions (no-op in native build, or could print to stdout)
void serial_init(uint32_t) {}
void serial_print(const char*) {}
void serial_println(const char*) {}

} // namespace hal

namespace hal::test {

void set_time(uint32_t ms) {
    simulated_time_ms = ms;
}

void advance_time(uint32_t ms) {
    simulated_time_ms += ms;
}

void inject_packet(uint8_t run_index, const uint8_t* data, size_t len) {
    InjectedPacket pkt;
    pkt.run_index = run_index;
    pkt.data.assign(data, data + len);
    packet_queue.push(std::move(pkt));
}

const LedState& get_led(int strip, int index) {
    static LedState black = {0, 0, 0};
    if (strip < 0 || strip >= NUM_STRIPS || index < 0 || index >= max_leds) {
        return black;
    }
    return led_buffer[strip * max_leds + index];
}

int get_show_count() {
    return show_count;
}

const std::vector<std::string>& get_sent_heartbeats() {
    return sent_heartbeats;
}

bool get_status_led() {
    return status_led_state;
}

void reset() {
    simulated_time_ms = 0;
    link_up = true;
    status_led_state = false;
    show_count = 0;

    // Clear LED buffer
    for (auto& led : led_buffer) {
        led = {0, 0, 0};
    }

    // Clear packet queue
    while (!packet_queue.empty()) {
        packet_queue.pop();
    }

    // Clear heartbeat capture
    sent_heartbeats.clear();
}

} // namespace hal::test

#endif // NATIVE_BUILD
