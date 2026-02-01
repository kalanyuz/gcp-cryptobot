#!/usr/bin/env python3
"""
Claude Code Trading Agent Runner

Invokes Claude Code CLI to analyze market and make trading decisions.

Usage:
    # Single run (analyze and decide)
    uv run python run_agent.py --symbol BTC/USDT

    # Run with specific model
    uv run python run_agent.py --symbol BTC/USDT --model sonnet

    # Continuous mode (run every candle close)
    uv run python run_agent.py --symbol BTC/USDT --continuous --timeframe 1h

    # Dry run (no actual trades)
    uv run python run_agent.py --symbol BTC/USDT --dry-run
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


# Timeframe to seconds
TIMEFRAME_SECONDS = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
}


def get_market_state(symbol: str, timeframe: str, db_path: str) -> dict | None:
    """Fetch market state using trade.py."""
    try:
        result = subprocess.run(
            ["uv", "run", "python", "trade.py", "market",
             "--symbol", symbol,
             "--timeframe", timeframe,
             "--db", db_path],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent,
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
        else:
            print(f"Error fetching market state: {result.stderr}")
            return None
    except Exception as e:
        print(f"Exception fetching market state: {e}")
        return None


def build_prompt(symbol: str, market_state: dict, dry_run: bool) -> str:
    """Build the prompt for Claude."""

    dry_run_note = """
**DRY RUN MODE**: Analyze the market but do NOT execute any trades.
Just log your decision using: uv run python trade.py decide --symbol {symbol} --action [BUY/SELL/HOLD] --reason "your reasoning"
""" if dry_run else ""

    prompt = f"""You are the trading agent. Analyze the market for {symbol} and make a trading decision.

{dry_run_note}

## Current Market State

```json
{json.dumps(market_state, indent=2)}
```

## Instructions

1. Read CLAUDE.md for trading rules
2. Analyze the market state above
3. Check if entry/exit criteria are met
4. Make your decision (BUY, SELL, or HOLD)
5. Execute the appropriate command

Remember:
- Only trade clear setups (3+ criteria met for entry)
- Always set stop loss and take profit
- Log your reasoning for audit trail
- Be patient - HOLD is often the best decision

Now analyze and act.
"""
    return prompt


def invoke_claude(prompt: str, model: str = "sonnet", max_turns: int = 10) -> str:
    """Invoke Claude Code CLI with the prompt."""

    # Build command
    cmd = [
        "claude",
        "--print",  # Non-interactive mode
        "--dangerously-skip-permissions",  # Allow tool use
        "--max-turns", str(max_turns),
    ]

    if model:
        cmd.extend(["--model", model])

    # Add the prompt
    cmd.append(prompt)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent,
            timeout=300,  # 5 minute timeout
        )

        output = result.stdout
        if result.stderr:
            output += f"\n\nSTDERR:\n{result.stderr}"

        return output

    except subprocess.TimeoutExpired:
        return "ERROR: Claude Code timed out after 5 minutes"
    except FileNotFoundError:
        return "ERROR: Claude Code CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
    except Exception as e:
        return f"ERROR: {str(e)}"


def calculate_next_candle_time(timeframe: str) -> tuple[int, datetime]:
    """Calculate seconds until next candle close."""
    now = datetime.now(timezone.utc)
    interval = TIMEFRAME_SECONDS.get(timeframe, 86400)

    epoch_seconds = int(now.timestamp())
    current_candle_start = (epoch_seconds // interval) * interval
    next_candle_close = current_candle_start + interval

    sleep_seconds = next_candle_close - epoch_seconds + 5  # 5 sec buffer
    next_time = datetime.fromtimestamp(next_candle_close, timezone.utc)

    return max(sleep_seconds, 10), next_time


def run_single(symbol: str, timeframe: str, db_path: str, model: str, dry_run: bool) -> str:
    """Run a single analysis cycle."""
    print(f"\n{'='*60}")
    print(f"Trading Agent Run - {datetime.now(timezone.utc).isoformat()}")
    print(f"Symbol: {symbol} | Timeframe: {timeframe} | Dry Run: {dry_run}")
    print(f"{'='*60}\n")

    # Get market state
    print("Fetching market state...")
    market_state = get_market_state(symbol, timeframe, db_path)

    if not market_state:
        print("Failed to fetch market state. Aborting.")
        return "ERROR: Could not fetch market state"

    if "error" in market_state:
        print(f"Market state error: {market_state['error']}")
        return f"ERROR: {market_state['error']}"

    print(f"Current price: ${market_state.get('current_price', 0):,.2f}")
    print(f"Confluence: {market_state.get('confluence_level', 'unknown')}")
    print(f"Has position: {market_state.get('has_position', False)}")
    print()

    # Build prompt and invoke Claude
    print("Invoking Claude Code for analysis...")
    prompt = build_prompt(symbol, market_state, dry_run)
    output = invoke_claude(prompt, model)

    print("\n" + "-"*60)
    print("Claude Output:")
    print("-"*60)
    print(output)
    print("-"*60 + "\n")

    return output


def run_continuous(symbol: str, timeframe: str, db_path: str, model: str, dry_run: bool):
    """Run continuously, executing at each candle close."""
    print(f"Starting continuous trading agent for {symbol}")
    print(f"Timeframe: {timeframe}")
    print(f"Dry run: {dry_run}")
    print("Press Ctrl+C to stop\n")

    while True:
        try:
            # Run analysis
            run_single(symbol, timeframe, db_path, model, dry_run)

            # Calculate next run time
            sleep_seconds, next_time = calculate_next_candle_time(timeframe)
            print(f"Next run at {next_time.isoformat()} (in {sleep_seconds}s)")
            print("Sleeping...\n")

            time.sleep(sleep_seconds)

        except KeyboardInterrupt:
            print("\nStopping trading agent...")
            break
        except Exception as e:
            print(f"Error: {e}")
            print("Retrying in 60 seconds...")
            time.sleep(60)


def main():
    parser = argparse.ArgumentParser(description="Claude Code Trading Agent")
    parser.add_argument("--symbol", default="BTC/USDT", help="Trading pair")
    parser.add_argument("--timeframe", default="1d", help="Candle timeframe")
    parser.add_argument("--db", default="trading.db", help="Database path")
    parser.add_argument("--model", default="sonnet", help="Claude model (sonnet, opus, haiku)")
    parser.add_argument("--dry-run", action="store_true", help="Don't execute trades")
    parser.add_argument("--continuous", action="store_true", help="Run continuously")
    parser.add_argument("--max-turns", type=int, default=10, help="Max Claude turns")

    args = parser.parse_args()

    # Initialize database if needed
    from src.cryptobot.database import TradingDatabase
    db = TradingDatabase(args.db)
    portfolio = db.get_portfolio_summary()
    if portfolio.get("total_balance", 0) == 0:
        print("Initializing portfolio with $10,000...")
        db.update_portfolio(10000, 10000, 0, 0)
    db.close()

    if args.continuous:
        run_continuous(args.symbol, args.timeframe, args.db, args.model, args.dry_run)
    else:
        run_single(args.symbol, args.timeframe, args.db, args.model, args.dry_run)


if __name__ == "__main__":
    main()
