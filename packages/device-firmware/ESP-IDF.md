# How to setup your ESP-IDF environment

The ESP-IDF is a toolchain allowing you to compile the firmware for the ESP class of devices. My device is ESP32 (a paricular model of microcontroller), others can be used.

## 1. Install the toolchain
This clones the ESP-IDF repo to your root:
```
mkdir -p ~/esp
cd ~/esp
git clone --recursive https://github.com/espressif/esp-idf.git
```
This downloads the cross-compiler, CMake integration, Python packages, etc. It will install to your root:
```
cd ~/esp/esp-idf
./install.sh esp32   # add more targets if you’ll use them, e.g. "esp32s3 esp32c3"
./install.sh --enable-pytest
```

## 2. Export the environment
Repeat this for every session where you want to build, or add it to your path (not recommended, it takes a while and you don't want that every time you start a session).
```
. ~/esp/esp-idf/export.sh
idf.py --version
```
You should see a version printed if this was sucessful.

## 3. Build the firmware
You can now go to the `./firmware` directory and build.