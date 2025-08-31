#include "unity.h"
#include "startup_sequence.h"

static unsigned int flashed_runs[8];
static unsigned int flash_count;
static void flash_stub(unsigned int run_index,
                       uint8_t red, uint8_t green, uint8_t blue)
{
    flashed_runs[flash_count++] = run_index;
    TEST_ASSERT_EQUAL_UINT8(STARTUP_RED, red);
    TEST_ASSERT_EQUAL_UINT8(STARTUP_GREEN, green);
    TEST_ASSERT_EQUAL_UINT8(STARTUP_BLUE, blue);
}

static unsigned int black_count;
static void black_stub(void)
{
    ++black_count;
}

static unsigned int delay_count;
static uint32_t delays[8];
static void delay_stub(uint32_t ms)
{
    delays[delay_count++] = ms;
}

void test_startup_sequence_flashes_runs_sequentially(void)
{
    flash_count = 0;
    black_count = 0;
    delay_count = 0;
    startup_sequence(3, flash_stub, black_stub, delay_stub);
    TEST_ASSERT_EQUAL_UINT(3, flash_count);
    TEST_ASSERT_EQUAL_UINT(3, black_count);
    TEST_ASSERT_EQUAL_UINT32(4, delay_count);
    for (unsigned int i = 0; i < delay_count; ++i) {
        TEST_ASSERT_EQUAL_UINT32(1000, delays[i]);
    }
    TEST_ASSERT_EQUAL_UINT(0, flashed_runs[0]);
    TEST_ASSERT_EQUAL_UINT(1, flashed_runs[1]);
    TEST_ASSERT_EQUAL_UINT(2, flashed_runs[2]);
}

void setUp(void) {}
void tearDown(void) {}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_startup_sequence_flashes_runs_sequentially);
    return UNITY_END();
}

