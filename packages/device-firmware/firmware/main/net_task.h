#pragma once

#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"

#define NETWORK_READY_BIT BIT0

// Starts the network task and returns the event group used for signalling.
EventGroupHandle_t net_task_start(void);

