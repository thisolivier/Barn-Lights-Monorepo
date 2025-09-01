#!/usr/bin/env python3
"""Monitor heartbeat telemetry from both walls and display it in a table."""

import argparse
import json
import socket
import time
from typing import Dict, Optional

TELEMETRY_PORT = 49700
BUFFER_SIZE = 1024
DEVICE_IDS = ["LEFT", "RIGHT"]


def render_table(last_data: Dict[str, Optional[dict]], last_seen: Dict[str, Optional[float]]) -> None:
    """Print a table of the most recent heartbeat data."""
    header = (
        f"{'Device':<6} {'IP':<15} {'Uptime(ms)':<12} {'Link':<5} "
        f"{'Rx':<10} {'Complete':<10} {'Applied':<10} {'Dropped':<10} {'Last Seen':<10}"
    )
    print(header)
    print("-" * len(header))
    current_time = time.time()
    for device_id in DEVICE_IDS:
        heartbeat = last_data.get(device_id)
        if heartbeat is None:
            row = (
                f"{device_id:<6} {'--':<15} {'--':<12} {'--':<5} "
                f"{'--':<10} {'--':<10} {'--':<10} {'--':<10} {'--':<10}"
            )
        else:
            seconds_since = current_time - (last_seen.get(device_id) or current_time)
            row = (
                f"{device_id:<6} {heartbeat.get('ip', '--'):<15} {heartbeat.get('uptime_ms', '--'):<12} "
                f"{str(heartbeat.get('link', '--')):<5} {heartbeat.get('rx_frames', '--'):<10} "
                f"{heartbeat.get('complete', '--'):<10} {heartbeat.get('applied', '--'):<10} "
                f"{heartbeat.get('dropped_frames', '--'):<10} {seconds_since:>.1f}s"
            )
        print(row)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Monitor heartbeat telemetry from barn wall controllers."
    )
    parser.add_argument(
        "--port",
        type=int,
        default=TELEMETRY_PORT,
        help="UDP port to listen on",
    )
    arguments = parser.parse_args()

    listen_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    listen_socket.bind(("", arguments.port))
    listen_socket.setblocking(False)

    last_data: Dict[str, Optional[dict]] = {device: None for device in DEVICE_IDS}
    last_seen: Dict[str, Optional[float]] = {device: None for device in DEVICE_IDS}

    try:
        while True:
            while True:
                try:
                    payload, address = listen_socket.recvfrom(BUFFER_SIZE)
                    heartbeat = json.loads(payload.decode("utf-8"))
                    device_id = heartbeat.get("id")
                    if device_id in DEVICE_IDS:
                        last_data[device_id] = heartbeat
                        last_seen[device_id] = time.time()
                except BlockingIOError:
                    break
                except json.JSONDecodeError:
                    continue
            print("\033[2J\033[H", end="")
            render_table(last_data, last_seen)
            time.sleep(1)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
