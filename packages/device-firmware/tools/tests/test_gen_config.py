from pathlib import Path
import json
import shlex
import subprocess
import sys


SIDE_MAPPING = {"left": 0, "right": 1}


def run_and_read(layout: str, tmp_dir: Path) -> str:
    repo_root = Path(__file__).resolve().parents[2]
    output_path = tmp_dir / "config_autogen.h"
    subprocess.run(
        ["python", "tools/gen_config.py", "--layout", str(repo_root / layout), "--output", str(output_path)],
        check=True,
        cwd=repo_root,
    )
    return output_path.read_text()


def run_gen_config(
    layout_path: Path, output_path: Path | None = None, run_as: str | None = None
) -> subprocess.CompletedProcess:
    repo_root = Path(__file__).resolve().parents[2]
    command = [sys.executable, "tools/gen_config.py", "--layout", str(layout_path)]
    if output_path is not None:
        command.extend(["--output", str(output_path)])
    if run_as is not None:
        shell_command = " ".join(shlex.quote(part) for part in command)
        command = ["su", run_as, "-s", "/bin/sh", "-c", shell_command]
    return subprocess.run(
        command,
        cwd=repo_root,
        capture_output=True,
        text=True,
    )


def assert_header_matches_layout(layout_file: str, tmp_dir: Path) -> None:
    repo_root = Path(__file__).resolve().parents[2]
    layout_path = repo_root / layout_file
    layout_data = json.loads(layout_path.read_text())

    header_text = run_and_read(layout_file, tmp_dir)

    side_identifier = SIDE_MAPPING[layout_data["side"].lower()]
    assert f"#define SIDE_ID {side_identifier}" in header_text

    run_count = len(layout_data["runs"])
    assert f"#define RUN_COUNT {run_count}" in header_text

    total_led_count = layout_data["total_leds"]
    assert f"#define TOTAL_LED_COUNT {total_led_count}" in header_text

    port_base = layout_data["port_base"]
    assert f"#define PORT_BASE {port_base}" in header_text

    gateway_port = layout_data["gateway_telemetry_port"]
    assert f"#define STATUS_PORT {gateway_port}" in header_text

    expected_led_counts = "{" + ", ".join(str(run["led_count"]) for run in layout_data["runs"]) + "}"
    assert expected_led_counts in header_text

    for index, value in enumerate(layout_data["static_ip"]):
        assert f"#define STATIC_IP_ADDR{index} {value}" in header_text
    for index, value in enumerate(layout_data["static_netmask"]):
        assert f"#define STATIC_NETMASK_ADDR{index} {value}" in header_text
    for index, value in enumerate(layout_data["static_gateway"]):
        assert f"#define STATIC_GW_ADDR{index} {value}" in header_text


def test_left_layout_generates_expected_header(tmp_path):
    assert_header_matches_layout("left.json", tmp_path)


def test_right_layout_generates_expected_header(tmp_path):
    assert_header_matches_layout("right.json", tmp_path)


def test_four_run_layout_generates_expected_header(tmp_path):
    assert_header_matches_layout("four_run.json", tmp_path)


def test_missing_side_field_results_in_error(tmp_path):
    repo_root = Path(__file__).resolve().parents[2]
    malformed_layout_path = tmp_path / "missing_side.json"
    layout_data = json.loads((repo_root / "left.json").read_text())
    layout_data.pop("side")
    malformed_layout_path.write_text(json.dumps(layout_data))

    process = run_gen_config(malformed_layout_path)
    assert process.returncode != 0
    assert "unknown side" in process.stderr.lower()


def test_missing_port_base_results_in_error(tmp_path):
    repo_root = Path(__file__).resolve().parents[2]
    malformed_layout_path = tmp_path / "missing_port_base.json"
    layout_data = json.loads((repo_root / "left.json").read_text())
    layout_data.pop("port_base")
    malformed_layout_path.write_text(json.dumps(layout_data))

    process = run_gen_config(malformed_layout_path)
    assert process.returncode != 0
    assert "port_base" in process.stderr.lower()


def test_missing_gateway_port_results_in_error(tmp_path):
    repo_root = Path(__file__).resolve().parents[2]
    malformed_layout_path = tmp_path / "missing_gateway_port.json"
    layout_data = json.loads((repo_root / "left.json").read_text())
    layout_data.pop("gateway_telemetry_port")
    malformed_layout_path.write_text(json.dumps(layout_data))

    process = run_gen_config(malformed_layout_path)
    assert process.returncode != 0
    assert "gateway_telemetry_port" in process.stderr.lower()
