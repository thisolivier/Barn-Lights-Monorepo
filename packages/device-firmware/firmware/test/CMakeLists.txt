cmake_minimum_required(VERSION 3.14)
project(firmware_tests C)

include(FetchContent)

FetchContent_Declare(
    unity
    GIT_REPOSITORY https://github.com/ThrowTheSwitch/Unity.git
    GIT_TAG v2.5.2
)
FetchContent_GetProperties(unity)
if(NOT unity_POPULATED)
    FetchContent_Populate(unity)
    add_library(unity ${unity_SOURCE_DIR}/src/unity.c)
    target_include_directories(unity PUBLIC ${unity_SOURCE_DIR}/src)
endif()

add_executable(test_rx_task
    test_rx_task.c
    ../main/rx_task.c
)

target_include_directories(test_rx_task PRIVATE ../include ../main)
target_compile_definitions(test_rx_task PRIVATE UNIT_TEST)
target_link_libraries(test_rx_task unity)

add_executable(test_status_task
    test_status_task.c
    ../main/status_task.c
)

target_include_directories(test_status_task PRIVATE ../include ../main)
target_compile_definitions(test_status_task PRIVATE UNIT_TEST)
target_link_libraries(test_status_task unity)

