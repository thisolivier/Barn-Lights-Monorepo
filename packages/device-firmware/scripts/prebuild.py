"""
PlatformIO pre-build script to generate config_autogen.h from device JSON.

Usage:
    LED_CONFIG=config/left.json pio run
    LED_CONFIG=/absolute/path/to/device.json pio run

If LED_CONFIG is not set, the build will fail with a helpful error message.
"""

import os
import sys
from pathlib import Path

Import("env")

# Get the project root directory
project_dir = Path(env["PROJECT_DIR"])

# Get config path from environment variable
config_path_str = os.environ.get("LED_CONFIG")

if not config_path_str:
    print("\n" + "=" * 60)
    print("ERROR: LED_CONFIG environment variable not set")
    print("=" * 60)
    print("\nUsage:")
    print("  LED_CONFIG=config/left.json pio run")
    print("  LED_CONFIG=/path/to/device.json pio run")
    print("\nAvailable configs in this repo:")
    config_dir = project_dir / "config"
    if config_dir.exists():
        for f in config_dir.glob("*.json"):
            print(f"  - {f.relative_to(project_dir)}")
    print("=" * 60 + "\n")
    sys.exit(1)

# Resolve config path (relative to project dir or absolute)
config_path = Path(config_path_str)
if not config_path.is_absolute():
    config_path = project_dir / config_path

if not config_path.exists():
    print(f"\nERROR: Config file not found: {config_path}\n")
    sys.exit(1)

# Run gen_config.py to generate the header
gen_script = project_dir / "scripts" / "gen_config.py"
output_file = project_dir / "src" / "config_autogen.h"

# Ensure src directory exists
output_file.parent.mkdir(parents=True, exist_ok=True)

print(f"Generating config from: {config_path}")

import subprocess
result = subprocess.run(
    [sys.executable, str(gen_script), str(config_path)],
    capture_output=True,
    text=True
)

if result.returncode != 0:
    print(f"\nERROR: Config generation failed:\n{result.stderr}\n")
    sys.exit(1)

# Write the generated header
output_file.write_text(result.stdout)
print(f"Generated: {output_file.relative_to(project_dir)}")
