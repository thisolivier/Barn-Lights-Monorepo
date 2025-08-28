#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static void network_task(void *task_parameters)
{
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

static void rx_task(void *task_parameters)
{
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

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
    xTaskCreate(network_task, "network_task", 2048, NULL, 5, NULL);
    xTaskCreate(rx_task, "rx_task", 2048, NULL, 5, NULL);
    xTaskCreate(driver_task, "driver_task", 2048, NULL, 5, NULL);
    xTaskCreate(status_task, "status_task", 2048, NULL, 5, NULL);
}
