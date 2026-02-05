#!/bin/bash

# Kill all LED Lights project processes regardless of working directory

echo "Stopping all LED Lights processes..."

# Stop PM2 daemon if running (this kills all pm2-managed processes)
if npx pm2 pid > /dev/null 2>&1; then
  echo "Stopping PM2 daemon..."
  npx pm2 kill 2>/dev/null
fi

# Kill any stray engine.mjs processes
if pgrep -f "engine.mjs" > /dev/null 2>&1; then
  echo "Killing engine.mjs processes..."
  pkill -f "engine.mjs"
fi

# Kill any stray lights-sender.mjs processes
if pgrep -f "lights-sender.mjs" > /dev/null 2>&1; then
  echo "Killing lights-sender.mjs processes..."
  pkill -f "lights-sender.mjs"
fi

# Kill any stray telemetry.mjs processes
if pgrep -f "telemetry.mjs" > /dev/null 2>&1; then
  echo "Killing telemetry.mjs processes..."
  pkill -f "telemetry.mjs"
fi

echo "All processes stopped."
