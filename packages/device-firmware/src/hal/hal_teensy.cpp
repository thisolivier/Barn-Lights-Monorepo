#ifndef NATIVE_BUILD

#include "hal.h"
#include "../config_autogen.h"
#include <Arduino.h>
#include <OctoWS2811.h>
#include <QNEthernet.h>

using namespace qindesign::network;

// OctoWS2811 configuration
static const int NUM_STRIPS = 8;
static int leds_per_strip = 0;

// OctoWS2811 memory (allocated in leds_init)
static int* display_memory = nullptr;
static int* drawing_memory = nullptr;
static OctoWS2811* leds = nullptr;

// Network configuration
static EthernetUDP udp_sockets[RUN_COUNT > 0 ? RUN_COUNT : 1];
static EthernetUDP status_socket;

static IPAddress static_ip(STATIC_IP_0, STATIC_IP_1, STATIC_IP_2, STATIC_IP_3);
static IPAddress netmask(STATIC_NETMASK_0, STATIC_NETMASK_1, STATIC_NETMASK_2, STATIC_NETMASK_3);
static IPAddress gateway(STATIC_GATEWAY_0, STATIC_GATEWAY_1, STATIC_GATEWAY_2, STATIC_GATEWAY_3);
static IPAddress sender_ip(SENDER_IP_0, SENDER_IP_1, SENDER_IP_2, SENDER_IP_3);

static char ip_string[16];
static uint8_t packet_buffer[2048];

// Status LED
static const int STATUS_LED_PIN = 13;

namespace hal {

// Time functions
uint32_t millis() {
    return ::millis();
}

void delay_ms(uint32_t ms) {
    ::delay(ms);
}

void delay_us(uint32_t us) {
    ::delayMicroseconds(us);
}

// Network functions
void network_init() {
    // Configure static IP
    Ethernet.begin(static_ip, netmask, gateway);

    // Format IP string for heartbeat
    snprintf(ip_string, sizeof(ip_string), "%d.%d.%d.%d",
             STATIC_IP_0, STATIC_IP_1, STATIC_IP_2, STATIC_IP_3);

    // Bind UDP socket for each run
    for (int i = 0; i < RUN_COUNT; i++) {
        udp_sockets[i].begin(PORT_BASE + i);
    }

    // Status socket for sending heartbeats
    status_socket.begin(0);
}

bool network_link_up() {
    return Ethernet.linkState();
}

const char* network_get_ip() {
    return ip_string;
}

void network_poll(PacketCallback cb) {
    // Check each run's UDP socket for incoming packets
    for (int run_index = 0; run_index < RUN_COUNT; run_index++) {
        int packet_size = udp_sockets[run_index].parsePacket();

        while (packet_size > 0) {
            // Read packet data
            int len = udp_sockets[run_index].read(packet_buffer, sizeof(packet_buffer));

            if (len > 0 && cb != nullptr) {
                cb(run_index, packet_buffer, len);
            }

            // Check for more packets on this socket
            packet_size = udp_sockets[run_index].parsePacket();
        }
    }
}

void network_send_udp(const char* json, size_t len) {
    status_socket.beginPacket(sender_ip, STATUS_PORT);
    status_socket.write((const uint8_t*)json, len);
    status_socket.endPacket();
}

// LED functions
void leds_init(int max_leds_per_strip) {
    leds_per_strip = max_leds_per_strip;

    // Allocate memory for OctoWS2811
    // OctoWS2811 requires 6 integers per LED for double buffering
    display_memory = new int[leds_per_strip * 6];
    drawing_memory = new int[leds_per_strip * 6];

    // Create OctoWS2811 instance
    leds = new OctoWS2811(leds_per_strip, display_memory, drawing_memory,
                          WS2811_GRB | WS2811_800kHz);
    leds->begin();
}

void leds_set_pixel(int strip, int index, uint8_t r, uint8_t g, uint8_t b) {
    if (leds == nullptr || strip < 0 || strip >= NUM_STRIPS ||
        index < 0 || index >= leds_per_strip) {
        return;
    }

    // OctoWS2811 uses linear addressing: strip * leds_per_strip + index
    // Color is packed as 0x00RRGGBB (OctoWS2811 handles GRB conversion)
    int color = (r << 16) | (g << 8) | b;
    leds->setPixel(strip * leds_per_strip + index, color);
}

void leds_show() {
    if (leds != nullptr) {
        leds->show();
    }
}

bool leds_busy() {
    return leds != nullptr ? leds->busy() : false;
}

// Status LED functions
void status_led_init() {
    pinMode(STATUS_LED_PIN, OUTPUT);
    digitalWrite(STATUS_LED_PIN, LOW);
}

void status_led_set(bool on) {
    digitalWrite(STATUS_LED_PIN, on ? HIGH : LOW);
}

// Serial functions
void serial_init(uint32_t baud) {
    Serial.begin(baud);
}

void serial_print(const char* str) {
    Serial.print(str);
}

void serial_println(const char* str) {
    Serial.println(str);
}

} // namespace hal

#endif // !NATIVE_BUILD
