# Tests

This repository uses three layers of tests to validate different parts of the system:

## Python tests

Located in `tools/tests`, these tests use `pytest` to exercise the configuration
utility. They assert that malformed layout files are rejected and that valid
layouts produce the expected `config_autogen.h` output.

## Host tests

The `firmware/test` directory contains Unity-based C tests that build and run on
a host machine. These focus on FreeRTOS task logic such as the `rx_task`
message-parsing behaviour without requiring an ESP32.

## Firmware unit tests

ESP-IDF's built-in test runner executes tests on the target or in the ESP-IDF
emulation environment. Running `idf.py test` within the `firmware` directory
builds and runs these tests to assert correct integration with the ESP-IDF
framework. These tests are not executed in continuous integration and should
be run locally when developing firmware changes.
