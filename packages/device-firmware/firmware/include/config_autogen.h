#pragma once

#define SIDE_ID 0
#define RUN_COUNT 3
#define TOTAL_LED_COUNT 1041
#define PORT_BASE 49600
#define STATUS_PORT 49700
#define STATIC_IP_ADDR0 10
#define STATIC_IP_ADDR1 10
#define STATIC_IP_ADDR2 0
#define STATIC_IP_ADDR3 2
#define STATIC_NETMASK_ADDR0 255
#define STATIC_NETMASK_ADDR1 255
#define STATIC_NETMASK_ADDR2 255
#define STATIC_NETMASK_ADDR3 0
#define STATIC_GW_ADDR0 10
#define STATIC_GW_ADDR1 10
#define STATIC_GW_ADDR2 0
#define STATIC_GW_ADDR3 1

_Static_assert(RUN_COUNT <= 4, "RUN_COUNT exceeds 4");
_Static_assert(362 <= 400, "LED_COUNT[0] exceeds 400");
_Static_assert(300 <= 400, "LED_COUNT[1] exceeds 400");
_Static_assert(379 <= 400, "LED_COUNT[2] exceeds 400");

static const unsigned int LED_COUNT[RUN_COUNT] = {362, 300, 379};
