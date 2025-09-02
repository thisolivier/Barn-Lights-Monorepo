#pragma once

#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"

// Starts the control task which listens for reboot commands.
void control_task_start(EventGroupHandle_t network_event_group);

