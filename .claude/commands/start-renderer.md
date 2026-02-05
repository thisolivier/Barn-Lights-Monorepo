---
description: Start the renderer engine server with dynamic port allocation
allowed-tools: Bash(node:*), Bash(lsof:*)
---

Start the renderer engine server for development/testing.

## Step 1: Start the Server

Run the renderer engine with dynamic port allocation:

```bash
node packages/renderer/bin/engine.mjs --config-dir config --port 0 &
```

The server outputs `SERVER_PORT=XXXXX` to indicate the assigned port.

## Step 2: Confirm Running

Wait briefly, then verify the server is listening:

```bash
sleep 2
lsof -i -P | grep node | grep LISTEN
```

## Step 3: Report

Tell the user which port the server is running on, e.g.:
- "Server running at http://localhost:XXXXX"
