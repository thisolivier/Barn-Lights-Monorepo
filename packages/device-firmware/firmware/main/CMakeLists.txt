idf_component_register(SRCS "app_main.c" "net_task.c" INCLUDE_DIRS "")

unity_add_test(NAME test_net_task
               SOURCES "test/test_net_task.c"
               REQUIRES unity cmock esp_netif esp_eth esp_event)
