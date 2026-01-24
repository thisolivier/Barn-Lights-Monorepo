# Test Suite

This directory contains the unit test suite for the LED controller firmware using the Unity test framework.

## Overview

The test suite runs on native x86/ARM platforms using the HAL native implementation (`hal_native.cpp`). This enables fast testing without requiring Teensy hardware and provides deterministic control over time, network packets, and LED state.

## Test Files

### test_receiver.cpp
Tests the UDP packet receiver and frame assembly logic:
- Single run frame completion
- Multi-run frame assembly
- Frame ID ordering and stale frame rejection
- Session ID change detection and state reset
- Packet length validation
- Out-of-order frame handling
- Statistics tracking (rx_frames, complete_frames, drops)
- Error reporting

### test_status.cpp
Tests the status heartbeat module:
- Heartbeat interval timing (1 second)
- JSON generation and formatting
- Statistics collection and reset
- Error message inclusion
- Uptime calculation
- Network status reporting

### test_integration.cpp
End-to-end integration tests:
- Complete frame assembly and LED display pipeline
- Network polling and packet dispatch
- LED driver integration with receiver
- Status heartbeat generation during normal operation
- Multiple frame sequences
- Error recovery scenarios

## Running Tests

### Build and Run All Tests
```bash
# Native build (default test environment)
LED_CONFIG=config/right.json pio test

# Specific test
LED_CONFIG=config/right.json pio test -f test_receiver
```

### Test Configuration
Tests use a simplified configuration (typically `config/right.json` with 1 run, 20 LEDs) to keep test execution fast and deterministic.

## Test Architecture

### HAL Native Test Interface
Tests leverage `hal::test` namespace functions for:

**Time Control**:
- `set_time(ms)`: Set absolute time
- `advance_time(ms)`: Move time forward

**Packet Injection**:
- `inject_packet(run_index, data, len)`: Simulate incoming UDP packet

**State Capture**:
- `get_led(strip, index)`: Read LED RGB values
- `get_show_count()`: Count LED updates
- `get_sent_heartbeats()`: Capture heartbeat JSON messages
- `get_status_led()`: Read onboard LED state

**Reset**:
- `reset()`: Clear all test state between tests

### Unity Framework
Tests use Unity assertions:
- `TEST_ASSERT_EQUAL(expected, actual)`
- `TEST_ASSERT_TRUE(condition)`
- `TEST_ASSERT_NULL(pointer)`
- `TEST_ASSERT_EQUAL_MEMORY(expected, actual, len)`

Each test file includes:
- `setUp()`: Initialize modules before each test
- `tearDown()`: Cleanup after each test
- Individual test functions: `void test_feature_name(void)`

## Test Helpers

### Packet Builder
Helper function to construct valid UDP packets with session_id, frame_id, and RGB data:
```cpp
build_packet(buffer, session_id, frame_id, rgb_data, rgb_len)
```

### Frame Assembly
Tests typically:
1. Build valid packets with `build_packet()`
2. Inject via `hal::test::inject_packet()`
3. Call `receiver_handle_packet()` or `network_poll()`
4. Verify frame completion with `receiver_get_complete_frame()`
5. Check LED output with `hal::test::get_led()`

## Coverage Goals

Tests cover:
- Correct behavior under normal operation
- Edge cases (frame ID wraparound, session changes)
- Error conditions (malformed packets, length mismatches)
- Timing-sensitive logic (heartbeat intervals, frame timeouts)
- Statistics accuracy
- State machine transitions

## Adding New Tests

1. Add test function to appropriate file (or create new test file)
2. Follow naming convention: `test_module_feature_scenario`
3. Use `setUp()` to reset state via `hal::test::reset()`
4. Inject test conditions using `hal::test` functions
5. Assert expected outcomes using Unity assertions
6. Keep tests focused on single behavior
7. Add comments explaining non-obvious test scenarios

## Dependencies

- **Unity**: Test framework (managed by PlatformIO)
- **HAL Native**: Platform abstraction for testing (`src/hal/hal_native.cpp`)
- **Firmware Modules**: Actual implementation under test

## Continuous Integration

Tests can run in CI/CD pipelines:
```bash
LED_CONFIG=config/right.json pio test --environment native
```

Exit code 0 indicates all tests passed.
