#include "unity.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "mock_esp_netif.h"
#include "mock_esp_eth.h"
#include "mock_esp_event.h"

#define ESP_LOGI(tag, fmt, ...)
#define vTaskDelay(...) return

#define static
#include "net_task.c"
#undef static
#undef vTaskDelay
#undef ESP_LOGI

void setUp(void)
{
    network_event_group = xEventGroupCreate();
}

void tearDown(void)
{
    vEventGroupDelete(network_event_group);
}

void test_network_task_sets_ready_bit(void)
{
    esp_netif_init_ExpectAndReturn(ESP_OK);
    esp_event_loop_create_default_ExpectAndReturn(ESP_OK);
    esp_netif_new_ExpectAnyArgsAndReturn((esp_netif_t *)1);
    esp_eth_mac_new_esp32_ExpectAnyArgsAndReturn((esp_eth_mac_t *)1);
    esp_eth_phy_new_lan87xx_ExpectAnyArgsAndReturn((esp_eth_phy_t *)1);
    esp_eth_driver_install_ExpectAnyArgsAndReturn(ESP_OK);
    esp_netif_attach_ExpectAnyArgsAndReturn(ESP_OK);
    esp_eth_new_netif_glue_ExpectAnyArgsAndReturn((void *)1);
    esp_netif_dhcpc_stop_ExpectAnyArgsAndReturn(ESP_OK);
    esp_netif_set_ip_info_ExpectAnyArgsAndReturn(ESP_OK);
    esp_eth_start_ExpectAnyArgsAndReturn(ESP_OK);

    network_task(NULL);

    EventBits_t bits = xEventGroupGetBits(network_event_group);
    TEST_ASSERT_TRUE(bits & NETWORK_READY_BIT);
}
