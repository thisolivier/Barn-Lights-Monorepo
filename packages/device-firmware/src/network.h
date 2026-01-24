#pragma once

#include <cstdint>
#include <cstddef>

// Initialize QNEthernet with static IP, bind UDP sockets
void network_init();

// Poll for incoming UDP packets, dispatch to receiver
void network_poll();

// Send status JSON to sender
void network_send_status(const char* json, size_t len);

// Check if Ethernet link is up
bool network_link_up();

// Get IP address as string (for heartbeat)
const char* network_get_ip_string();
