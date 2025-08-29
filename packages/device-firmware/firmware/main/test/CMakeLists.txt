idf_component_register(SRCS "test_net_task.c"
                      PRIV_INCLUDE_DIRS ".."
                      PRIV_REQUIRES unity cmock esp_netif esp_eth esp_event)
