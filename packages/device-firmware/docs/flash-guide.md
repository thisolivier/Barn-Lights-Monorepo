
# How to flash your device

You will need
* Lots of jumper cables,
* A USB-TTL serial adapter
* A 5V power source

## Setup connections
* Connect RX, TX and GND on the adapter to RX0, TX0 and GND on the board
* Setup 5V+ to 5V, and 5V neutral to a spare GND
* Have a switch/brief connector ready for EN->GND (this will restart the device)
* Ensure the TTL adapter is set for 3.3V mode
* Setup a bridge between IO0 pin and GND (puts hte device into download mode)

## Once you're setup
* Connect your USB
* Power up the ESP32
* Bridge IO0 and GND (leave attached)
* Briefly connect EN to GND (restarts the device)
* Flash the device from your computer `idf.py -p PORT flash`(you need to know your port first) 

## Work out your port
1. Unplug the adapter.
2. In Terminal:
`ls -1 /dev/tty.* /dev/cu.* > /tmp/ports_before.txt`
3. Plug in the adapter, wait 3–5 s, then:
```
ls -1 /dev/tty.* /dev/cu.* > /tmp/ports_after.txt
diff /tmp/ports_before.txt /tmp/ports_after.txt
```
4. Use the section containing `cu`, e.g. `/dev/cu.usbserial-xxxxx`

/dev/cu.usbserial-0001

`idf.py -p /dev/cu.usbserial-0001 flash`

python -m esptool --chip esp32 -p /dev/cu.usbserial-0001 -b 115200 read_mac