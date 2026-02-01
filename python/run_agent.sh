#!/bin/bash
# Trading Agent Cron Script
#
# Add to crontab for automated trading:
#   # Run every day at 00:05 UTC (after daily candle close)
#   5 0 * * * /path/to/run_agent.sh BTC/USDT 1d
#
#   # Run every 4 hours
#   5 */4 * * * /path/to/run_agent.sh ETH/USDT 4h

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SYMBOL="${1:-BTC/USDT}"
TIMEFRAME="${2:-1d}"
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/agent_$(date +%Y%m%d_%H%M%S).log"

# Create log directory
mkdir -p "$LOG_DIR"

# Load environment
if [ -f "$SCRIPT_DIR/.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Starting trading agent for $SYMBOL ($TIMEFRAME)" | tee -a "$LOG_FILE"

# Run agent
uv run python run_agent.py \
    --symbol "$SYMBOL" \
    --timeframe "$TIMEFRAME" \
    --model sonnet \
    2>&1 | tee -a "$LOG_FILE"

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Agent run completed" | tee -a "$LOG_FILE"
