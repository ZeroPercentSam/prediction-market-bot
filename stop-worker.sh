#!/bin/bash
#
# Stop the prediction market bot worker
#

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/logs/worker.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "No PID file found — worker may not be running"
  exit 0
fi

PID=$(cat "$PID_FILE")

if kill -0 "$PID" 2>/dev/null; then
  echo "Stopping worker (PID $PID)..."
  kill "$PID"
  sleep 2

  if kill -0 "$PID" 2>/dev/null; then
    echo "Worker still running, force killing..."
    kill -9 "$PID"
  fi

  rm -f "$PID_FILE"
  echo "Worker stopped."
else
  echo "Worker not running (stale PID $PID)"
  rm -f "$PID_FILE"
fi
