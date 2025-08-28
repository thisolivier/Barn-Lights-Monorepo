# Barn Lights Firmware

Utilities and firmware for the barn lights project.

## Development

Install Python dependencies:

```
python -m pip install -r tools/requirements.txt
```

Run tests:

```
pytest
```

Build firmware (requires ESP-IDF):

```
cd firmware
idf.py build
```
