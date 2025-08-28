from pathlib import Path
import subprocess


def run_and_read(layout: str, tmp_dir: Path) -> str:
    repo_root = Path(__file__).resolve().parents[2]
    output_path = tmp_dir / "config_autogen.h"
    subprocess.run(
        ["python", "tools/gen_config.py", "--layout", str(repo_root / layout), "--output", str(output_path)],
        check=True,
        cwd=repo_root,
    )
    return output_path.read_text()


def test_left_layout_generates_expected_header(tmp_path):
    header_text = run_and_read("left.json", tmp_path)
    assert "#define SIDE_ID 0" in header_text
    assert "#define RUN_COUNT 3" in header_text
    assert "#define TOTAL_LED_COUNT 1200" in header_text
    assert "{400, 400, 400}" in header_text


def test_right_layout_generates_expected_header(tmp_path):
    header_text = run_and_read("right.json", tmp_path)
    assert "#define SIDE_ID 1" in header_text
    assert "#define RUN_COUNT 3" in header_text
    assert "#define TOTAL_LED_COUNT 1500" in header_text
    assert "{500, 500, 500}" in header_text
