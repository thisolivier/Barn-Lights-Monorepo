#pragma once

#define SIDE_ID 0
#define RUN_COUNT 3
#define TOTAL_LED_COUNT 1200

static const unsigned int LED_COUNT[RUN_COUNT] = {400, 400, 400};

// Static network configuration
#define STATIC_IP_ADDR0 192
#define STATIC_IP_ADDR1 168
#define STATIC_IP_ADDR2 0
#define STATIC_IP_ADDR3 50

#define STATIC_NETMASK_ADDR0 255
#define STATIC_NETMASK_ADDR1 255
#define STATIC_NETMASK_ADDR2 255
#define STATIC_NETMASK_ADDR3 0

#define STATIC_GW_ADDR0 192
#define STATIC_GW_ADDR1 168
#define STATIC_GW_ADDR2 0
#define STATIC_GW_ADDR3 1
