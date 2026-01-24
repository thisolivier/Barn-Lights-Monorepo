#include "network.h"
#include "config_autogen.h"
#include "receiver.h"
#include "hal/hal.h"

// Callback adapter: hal callback -> receiver
static void packet_callback(uint8_t run_index, const uint8_t* data, size_t len) {
    receiver_handle_packet(run_index, data, len);
}

void network_init() {
    hal::network_init();
}

void network_poll() {
    hal::network_poll(packet_callback);
}

void network_send_status(const char* json, size_t len) {
    hal::network_send_udp(json, len);
}

bool network_link_up() {
    return hal::network_link_up();
}

const char* network_get_ip_string() {
    return hal::network_get_ip();
}
