#include "net_task.h"
#include "rx_task.h"
#include "driver_task.h"
#include "status_task.h"

void app_main(void)
{
    net_task_start();
    rx_task_start();
    driver_task_start();
    status_task_start();
}
