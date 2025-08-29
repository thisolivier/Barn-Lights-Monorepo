#include "net_task.h"

#include "freertos/task.h"
#include "esp_event.h"
#include "esp_eth.h"
#include "esp_netif.h"
#include "esp_log.h"
#include "lwip/ip4_addr.h"
#include "config_autogen.h"

// Compile-time checks for static IP configuration
#ifndef STATIC_IP_ADDR0
#error "STATIC_IP_ADDR0 not defined"
#endif
#ifndef STATIC_IP_ADDR1
#error "STATIC_IP_ADDR1 not defined"
#endif
#ifndef STATIC_IP_ADDR2
#error "STATIC_IP_ADDR2 not defined"
#endif
#ifndef STATIC_IP_ADDR3
#error "STATIC_IP_ADDR3 not defined"
#endif
#ifndef STATIC_NETMASK_ADDR0
#error "STATIC_NETMASK_ADDR0 not defined"
#endif
#ifndef STATIC_NETMASK_ADDR1
#error "STATIC_NETMASK_ADDR1 not defined"
#endif
#ifndef STATIC_NETMASK_ADDR2
#error "STATIC_NETMASK_ADDR2 not defined"
#endif
#ifndef STATIC_NETMASK_ADDR3
#error "STATIC_NETMASK_ADDR3 not defined"
#endif
#ifndef STATIC_GW_ADDR0
#error "STATIC_GW_ADDR0 not defined"
#endif
#ifndef STATIC_GW_ADDR1
#error "STATIC_GW_ADDR1 not defined"
#endif
#ifndef STATIC_GW_ADDR2
#error "STATIC_GW_ADDR2 not defined"
#endif
#ifndef STATIC_GW_ADDR3
#error "STATIC_GW_ADDR3 not defined"
#endif

_Static_assert(STATIC_IP_ADDR0 <= 255 && STATIC_IP_ADDR1 <= 255 &&
               STATIC_IP_ADDR2 <= 255 && STATIC_IP_ADDR3 <= 255,
               "Static IP octets must be in range 0-255");
_Static_assert(STATIC_NETMASK_ADDR0 <= 255 && STATIC_NETMASK_ADDR1 <= 255 &&
               STATIC_NETMASK_ADDR2 <= 255 && STATIC_NETMASK_ADDR3 <= 255,
               "Netmask octets must be in range 0-255");
_Static_assert(STATIC_GW_ADDR0 <= 255 && STATIC_GW_ADDR1 <= 255 &&
               STATIC_GW_ADDR2 <= 255 && STATIC_GW_ADDR3 <= 255,
               "Gateway octets must be in range 0-255");

// RMII pin configuration
#define RMII_MDC_GPIO 23
#define RMII_MDIO_GPIO 18
#define RMII_REF_CLK_GPIO 0

_Static_assert(RMII_MDC_GPIO >= 0 && RMII_MDC_GPIO <= 39, "RMII_MDC_GPIO out of range");
_Static_assert(RMII_MDIO_GPIO >= 0 && RMII_MDIO_GPIO <= 39, "RMII_MDIO_GPIO out of range");
_Static_assert(RMII_REF_CLK_GPIO >= 0 && RMII_REF_CLK_GPIO <= 39, "RMII_REF_CLK_GPIO out of range");

static EventGroupHandle_t network_event_group;
static const char *LOG_TAG = "net_task";

static void network_task(void *param)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    esp_netif_config_t netif_config = ESP_NETIF_DEFAULT_ETH();
    esp_netif_t *netif = esp_netif_new(&netif_config);

    eth_mac_config_t mac_config = ETH_MAC_DEFAULT_CONFIG();
    eth_phy_config_t phy_config = ETH_PHY_DEFAULT_CONFIG();
    phy_config.phy_addr = 0;
    phy_config.reset_gpio_num = -1;

    eth_esp32_emac_config_t emac_config = ETH_ESP32_EMAC_DEFAULT_CONFIG();
    emac_config.smi_gpio.mdc_num = RMII_MDC_GPIO;
    emac_config.smi_gpio.mdio_num = RMII_MDIO_GPIO;
    emac_config.clock_config.rmii.clock_mode = EMAC_CLK_OUT;
    emac_config.clock_config.rmii.clock_gpio = RMII_REF_CLK_GPIO;

    esp_eth_mac_t *mac = esp_eth_mac_new_esp32(&emac_config, &mac_config);
    esp_eth_phy_t *phy = esp_eth_phy_new_lan87xx(&phy_config);

    esp_eth_config_t eth_config = ETH_DEFAULT_CONFIG(mac, phy);
    esp_eth_handle_t eth_handle = NULL;
    ESP_ERROR_CHECK(esp_eth_driver_install(&eth_config, &eth_handle));
    ESP_ERROR_CHECK(esp_netif_attach(netif, esp_eth_new_netif_glue(eth_handle)));

    esp_netif_ip_info_t ip_info;
    IP4_ADDR(&ip_info.ip, STATIC_IP_ADDR0, STATIC_IP_ADDR1, STATIC_IP_ADDR2, STATIC_IP_ADDR3);
    IP4_ADDR(&ip_info.netmask, STATIC_NETMASK_ADDR0, STATIC_NETMASK_ADDR1, STATIC_NETMASK_ADDR2, STATIC_NETMASK_ADDR3);
    IP4_ADDR(&ip_info.gw, STATIC_GW_ADDR0, STATIC_GW_ADDR1, STATIC_GW_ADDR2, STATIC_GW_ADDR3);
    ESP_ERROR_CHECK(esp_netif_dhcpc_stop(netif));
    ESP_ERROR_CHECK(esp_netif_set_ip_info(netif, &ip_info));

    ESP_ERROR_CHECK(esp_eth_start(eth_handle));
    xEventGroupSetBits(network_event_group, NETWORK_READY_BIT);
    ESP_LOGI(LOG_TAG, "Network ready");

    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

EventGroupHandle_t net_task_start(void)
{
    network_event_group = xEventGroupCreate();
    xTaskCreate(network_task, "net_task", 4096, NULL, 5, NULL);
    return network_event_group;
}

