#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "net_task.h"
#include "rx_task.h"
#include "driver_task.h"

static void status_task(void *task_parameters)
{
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

void app_main(void)
{
    net_task_start();
    rx_task_start();
    driver_task_start();
    xTaskCreate(status_task, "status_task", 2048, NULL, 5, NULL);
}
