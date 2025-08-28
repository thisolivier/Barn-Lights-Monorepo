#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "net_task.h"
#include "rx_task.h"

static void driver_task(void *task_parameters)
{
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

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
    xTaskCreate(driver_task, "driver_task", 2048, NULL, 5, NULL);
    xTaskCreate(status_task, "status_task", 2048, NULL, 5, NULL);
}
