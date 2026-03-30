#!/bin/bash
#
# Start the prediction market bot worker in the background
# Usage: ./start-worker.sh
#   Logs: logs/worker.log
#   PID:  logs/worker.pid
#   Stop: ./stop-worker.sh  or  kill $(cat logs/worker.pid)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

LOGS_DIR="$SCRIPT_DIR/logs"
PID_FILE="$LOGS_DIR/worker.pid"
LOG_FILE="$LOGS_DIR/worker.log"

mkdir -p "$LOGS_DIR"

# Check if already running
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Worker already running (PID $OLD_PID)"
    echo "Stop it first: ./stop-worker.sh"
    exit 1
  else
    echo "Stale PID file found, removing..."
    rm -f "$PID_FILE"
  fi
fi

echo "Starting prediction market bot worker..."
echo "  Logs:  $LOG_FILE"
echo "  Mode:  Paper Trading (autonomous)"
echo ""

# Run the worker in background with nohup
# bootstrap.ts loads .env.local and configures file logging to logs/worker.log
# Redirect stdout/stderr to /dev/null since bootstrap handles file logging
cd worker
nohup npx tsx bootstrap.ts > /dev/null 2>&1 &
WORKER_PID=$!
cd ..

echo "$WORKER_PID" > "$PID_FILE"
echo "Worker started (PID $WORKER_PID)"
echo ""
echo "Useful commands:"
echo "  tail -f logs/worker.log     # Watch live logs"
echo "  ./stop-worker.sh            # Stop the worker"
echo "  cat logs/worker.pid         # Check PID"
