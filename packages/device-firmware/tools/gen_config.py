import argparse
import json
from pathlib import Path


SIDE_MAPPING = {"left": 0, "right": 1}


def extract_octets(layout_data: dict, field_name: str) -> list:
    octets = layout_data.get(field_name, [])
    if len(octets) != 4:
        raise ValueError(f"{field_name} must have exactly 4 elements")
    for value in octets:
        if not isinstance(value, int) or not (0 <= value <= 255):
            raise ValueError(f"invalid octet in {field_name}: {octets}")
    return octets


def generate_header(layout_data: dict) -> str:
    side_name = layout_data.get("side", "")
    side_identifier = SIDE_MAPPING.get(side_name.lower())
    if side_identifier is None:
        raise ValueError(f"unknown side: {side_name}")

    run_count = len(layout_data.get("runs", []))
    led_counts = [run.get("led_count", 0) for run in layout_data.get("runs", [])]
    total_leds = layout_data.get("total_leds", 0)

    static_ip = extract_octets(layout_data, "static_ip")
    static_netmask = extract_octets(layout_data, "static_netmask")
    static_gateway = extract_octets(layout_data, "static_gateway")
    port_base = layout_data.get("port_base")
    if not isinstance(port_base, int):
        raise ValueError("port_base must be an integer")
    gateway_port = layout_data.get("gateway_telemetry_port")
    if not isinstance(gateway_port, int):
        raise ValueError("gateway_telemetry_port must be an integer")

    header_lines = [
        "#pragma once",
        "",
        f"#define SIDE_ID {side_identifier}",
        f"#define RUN_COUNT {run_count}",
        f"#define TOTAL_LED_COUNT {total_leds}",
        f"#define PORT_BASE {port_base}",
        f"#define STATUS_PORT {gateway_port}",
    ]

    for index, value in enumerate(static_ip):
        header_lines.append(f"#define STATIC_IP_ADDR{index} {value}")
    for index, value in enumerate(static_netmask):
        header_lines.append(f"#define STATIC_NETMASK_ADDR{index} {value}")
    for index, value in enumerate(static_gateway):
        header_lines.append(f"#define STATIC_GW_ADDR{index} {value}")

    header_lines.extend(
        [
            "",
            "static const unsigned int LED_COUNT[RUN_COUNT] = {" + ", ".join(str(count) for count in led_counts) + "};",
            "",
        ]
    )
    return "\n".join(header_lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate firmware configuration header from layout JSON.")
    parser.add_argument("--layout", required=True, help="Path to layout JSON file")
    parser.add_argument("--output", default="firmware/include/config_autogen.h", help="Path to output header file")
    arguments = parser.parse_args()

    layout_path = Path(arguments.layout)
    layout_data = json.loads(layout_path.read_text())

    header_text = generate_header(layout_data)

    output_path = Path(arguments.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(header_text)


if __name__ == "__main__":
    main()
