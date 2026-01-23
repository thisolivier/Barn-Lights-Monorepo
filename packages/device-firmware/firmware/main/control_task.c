#include "control_task.h"

#include "config_autogen.h"
#include <stdint.h>
#include "net_task.h"
#include "freertos/task.h"

#include "esp_log.h"
#include "esp_system.h"
#include "lwip/sockets.h"

static const char *LOG_TAG = "control_task";

// Port for reboot command, offset from PORT_BASE to avoid run ports.
static const uint16_t REBOOT_PORT = PORT_BASE + 100;

static void control_task(void *param)
{
    EventGroupHandle_t network_event_group = (EventGroupHandle_t)param;
    xEventGroupWaitBits(network_event_group, NETWORK_READY_BIT, pdFALSE, pdTRUE, portMAX_DELAY);

    int socket_descriptor = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    struct sockaddr_in bind_address = {
        .sin_family = AF_INET,
        .sin_addr.s_addr = htonl(INADDR_ANY),
        .sin_port = htons(REBOOT_PORT),
    };
    bind(socket_descriptor, (struct sockaddr *)&bind_address, sizeof(bind_address));

    uint8_t data_buffer[1];
    for (;;) {
        ssize_t received_length = recvfrom(socket_descriptor, data_buffer, sizeof(data_buffer), 0, NULL, NULL);
        if (received_length > 0) {
            ESP_LOGI(LOG_TAG, "Reboot command received");
            esp_restart();
        }
    }
}

void control_task_start(EventGroupHandle_t network_event_group)
{
    xTaskCreate(control_task, "control_task", 2048, (void *)network_event_group, 5, NULL);
}

