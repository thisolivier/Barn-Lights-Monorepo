import argparse
import json
from pathlib import Path


SIDE_MAPPING = {"left": 0, "right": 1}


def generate_header(layout_data: dict) -> str:
    side_name = layout_data.get("side", "")
    side_identifier = SIDE_MAPPING.get(side_name.lower())
    if side_identifier is None:
        raise ValueError(f"unknown side: {side_name}")

    run_count = len(layout_data.get("runs", []))
    led_counts = [run.get("led_count", 0) for run in layout_data.get("runs", [])]
    total_leds = layout_data.get("total_leds", 0)

    header_lines = [
        "#pragma once",
        "",
        f"#define SIDE_ID {side_identifier}",
        f"#define RUN_COUNT {run_count}",
        f"#define TOTAL_LED_COUNT {total_leds}",
        "",
        "static const unsigned int LED_COUNT[RUN_COUNT] = {" + ", ".join(str(count) for count in led_counts) + "};",
        "",
    ]
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
