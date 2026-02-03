#include <unity.h>
#include "../../src/hal/hal.h"
#include "../../src/wakeup.h"
#include "../../src/led_driver.h"
#include "../../src/config_autogen.h"

// Expected warm white values (must match wakeup.cpp)
static const uint8_t EXPECTED_WARM_WHITE_RED = 128;
static const uint8_t EXPECTED_WARM_WHITE_GREEN = 100;
static const uint8_t EXPECTED_WARM_WHITE_BLUE = 64;

// Timing constants (must match wakeup.cpp)
static const uint32_t RUN_LIGHT_DURATION_MS = 200;
static const uint32_t GAP_BETWEEN_RUNS_MS = 50;

void setUp(void) {
    hal::test::reset();
    driver_init();
    wakeup_init();
}

void tearDown(void) {
}

// Test: wakeup is not complete initially
void test_wakeup_not_complete_initially(void) {
    hal::test::set_time(0);
    wakeup_init();

    TEST_ASSERT_FALSE(wakeup_is_complete());
}

// Test: first run is lit with warm white after first poll
void test_first_run_lit_after_poll(void) {
    hal::test::set_time(0);
    wakeup_init();

    wakeup_poll();

    // First LED of run 0 should be warm white
    auto led = hal::test::get_led(0, 0);
    TEST_ASSERT_EQUAL(EXPECTED_WARM_WHITE_RED, led.r);
    TEST_ASSERT_EQUAL(EXPECTED_WARM_WHITE_GREEN, led.g);
    TEST_ASSERT_EQUAL(EXPECTED_WARM_WHITE_BLUE, led.b);

    // Other runs should be black
    if (RUN_COUNT > 1) {
        auto other_led = hal::test::get_led(1, 0);
        TEST_ASSERT_EQUAL(0, other_led.r);
        TEST_ASSERT_EQUAL(0, other_led.g);
        TEST_ASSERT_EQUAL(0, other_led.b);
    }
}

// Test: first run turns off after duration
void test_first_run_turns_off_after_duration(void) {
    hal::test::set_time(0);
    wakeup_init();

    // Light first run
    wakeup_poll();

    // Just before duration expires - still lit
    hal::test::set_time(RUN_LIGHT_DURATION_MS - 1);
    wakeup_poll();

    auto led = hal::test::get_led(0, 0);
    TEST_ASSERT_EQUAL(EXPECTED_WARM_WHITE_RED, led.r);

    // After duration - should be off
    hal::test::set_time(RUN_LIGHT_DURATION_MS);
    wakeup_poll();

    led = hal::test::get_led(0, 0);
    TEST_ASSERT_EQUAL(0, led.r);
    TEST_ASSERT_EQUAL(0, led.g);
    TEST_ASSERT_EQUAL(0, led.b);
}

// Test: second run lights after gap (if multiple runs)
void test_second_run_lights_after_gap(void) {
    if (RUN_COUNT < 2) {
        // Skip test if only one run configured
        TEST_PASS();
        return;
    }

    hal::test::set_time(0);
    wakeup_init();

    // Light first run
    wakeup_poll();

    // Turn off first run (after duration)
    hal::test::set_time(RUN_LIGHT_DURATION_MS);
    wakeup_poll();

    // Wait for gap
    hal::test::set_time(RUN_LIGHT_DURATION_MS + GAP_BETWEEN_RUNS_MS);
    wakeup_poll();

    // Second run should now be lit
    auto led_run1 = hal::test::get_led(1, 0);
    TEST_ASSERT_EQUAL(EXPECTED_WARM_WHITE_RED, led_run1.r);
    TEST_ASSERT_EQUAL(EXPECTED_WARM_WHITE_GREEN, led_run1.g);
    TEST_ASSERT_EQUAL(EXPECTED_WARM_WHITE_BLUE, led_run1.b);

    // First run should be off
    auto led_run0 = hal::test::get_led(0, 0);
    TEST_ASSERT_EQUAL(0, led_run0.r);
}

// Test: wakeup completes after all runs
void test_wakeup_completes_after_all_runs(void) {
    hal::test::set_time(0);
    wakeup_init();

    // Calculate total time for wakeup sequence:
    // RUN_COUNT runs * RUN_LIGHT_DURATION_MS + (RUN_COUNT - 1) gaps * GAP_BETWEEN_RUNS_MS
    uint32_t total_time = (RUN_COUNT * RUN_LIGHT_DURATION_MS) +
                          ((RUN_COUNT - 1) * GAP_BETWEEN_RUNS_MS);

    // Run wakeup effect to completion
    for (uint32_t time = 0; time <= total_time + 100; time += 10) {
        hal::test::set_time(time);
        wakeup_poll();
    }

    TEST_ASSERT_TRUE(wakeup_is_complete());
}

// Test: all LEDs in a run are lit during wakeup
void test_all_leds_in_run_are_lit(void) {
    hal::test::set_time(0);
    wakeup_init();

    wakeup_poll();

    // Check all LEDs in run 0 are warm white
    for (int led_index = 0; led_index < LED_COUNT[0]; led_index++) {
        auto led = hal::test::get_led(0, led_index);
        TEST_ASSERT_EQUAL_MESSAGE(EXPECTED_WARM_WHITE_RED, led.r, "Wrong red value");
        TEST_ASSERT_EQUAL_MESSAGE(EXPECTED_WARM_WHITE_GREEN, led.g, "Wrong green value");
        TEST_ASSERT_EQUAL_MESSAGE(EXPECTED_WARM_WHITE_BLUE, led.b, "Wrong blue value");
    }
}

// Test: wakeup poll does nothing after complete
void test_wakeup_poll_noop_after_complete(void) {
    hal::test::set_time(0);
    wakeup_init();

    // Complete the wakeup sequence
    uint32_t total_time = (RUN_COUNT * RUN_LIGHT_DURATION_MS) +
                          ((RUN_COUNT - 1) * GAP_BETWEEN_RUNS_MS) + 100;

    for (uint32_t time = 0; time <= total_time; time += 10) {
        hal::test::set_time(time);
        wakeup_poll();
    }

    TEST_ASSERT_TRUE(wakeup_is_complete());

    // Get show count after completion
    int show_count_before = hal::test::get_show_count();

    // Poll again - should do nothing
    hal::test::set_time(total_time + 1000);
    wakeup_poll();

    int show_count_after = hal::test::get_show_count();
    TEST_ASSERT_EQUAL(show_count_before, show_count_after);
}

int main(int argc, char** argv) {
    UNITY_BEGIN();

    RUN_TEST(test_wakeup_not_complete_initially);
    RUN_TEST(test_first_run_lit_after_poll);
    RUN_TEST(test_first_run_turns_off_after_duration);
    RUN_TEST(test_second_run_lights_after_gap);
    RUN_TEST(test_wakeup_completes_after_all_runs);
    RUN_TEST(test_all_leds_in_run_are_lit);
    RUN_TEST(test_wakeup_poll_noop_after_complete);

    return UNITY_END();
}
