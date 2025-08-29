from pathlib import Path
import json
import shlex
import subprocess
import sys


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


def test_left_layout_generates_expected_header(tmp_path):
    header_text = run_and_read("left.json", tmp_path)
    assert "#define SIDE_ID 0" in header_text
    assert "#define RUN_COUNT 3" in header_text
    assert "#define TOTAL_LED_COUNT 1200" in header_text
    assert "{400, 400, 400}" in header_text
    assert "#define STATIC_IP_ADDR0 10" in header_text
    assert "#define STATIC_IP_ADDR3 2" in header_text
    assert "#define STATIC_NETMASK_ADDR0 255" in header_text
    assert "#define STATIC_GW_ADDR3 1" in header_text


def test_right_layout_generates_expected_header(tmp_path):
    header_text = run_and_read("right.json", tmp_path)
    assert "#define SIDE_ID 1" in header_text
    assert "#define RUN_COUNT 3" in header_text
    assert "#define TOTAL_LED_COUNT 1500" in header_text
    assert "{500, 500, 500}" in header_text
    assert "#define STATIC_IP_ADDR3 3" in header_text
    assert "#define STATIC_NETMASK_ADDR1 255" in header_text
    assert "#define STATIC_GW_ADDR0 10" in header_text


def test_missing_side_field_results_in_error(tmp_path):
    repo_root = Path(__file__).resolve().parents[2]
    malformed_layout_path = tmp_path / "missing_side.json"
    layout_data = json.loads((repo_root / "left.json").read_text())
    layout_data.pop("side")
    malformed_layout_path.write_text(json.dumps(layout_data))

    process = run_gen_config(malformed_layout_path)
    assert process.returncode != 0
    assert "unknown side" in process.stderr.lower()
