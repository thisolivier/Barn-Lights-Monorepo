#include "net_task.h"
#include "rx_task.h"
#include "driver_task.h"
#include "status_task.h"
#include "control_task.h"

void app_main(void)
{
    EventGroupHandle_t network_event_group = net_task_start();
    control_task_start(network_event_group);
    rx_task_start();
    driver_task_start();
    status_task_start();
}
