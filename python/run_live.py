#!/usr/bin/env python3
"""Live trading runner - executes strategies on candle close.

Usage:
    # Dry run (no actual trades)
    uv run python run_live.py --dry-run

    # Live trading on testnet
    uv run python run_live.py --testnet

    # Live trading on mainnet (careful!)
    uv run python run_live.py

Environment variables:
    BINANCE_API_KEY     - Binance API key
    BINANCE_API_SECRET  - Binance API secret
    TRADING_SYMBOL      - Trading pair (default: BTC/USDT)
    TRADING_TIMEFRAME   - Candle timeframe (default: 1d)
    TRADING_STRATEGY    - Strategy name (default: cdc-confirmed-sma)
"""

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone

from dotenv import load_dotenv

from src.cryptobot.live_trader import LiveTrader, TraderConfig

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# Timeframe to seconds mapping
TIMEFRAME_SECONDS = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
}


def calculate_sleep_until_next_candle(timeframe: str) -> int:
    """Calculate seconds until next candle close.

    Args:
        timeframe: Candle timeframe (1m, 5m, 15m, 30m, 1h, 4h, 1d)

    Returns:
        Seconds to sleep until next candle close + small buffer
    """
    now = datetime.now(timezone.utc)
    interval = TIMEFRAME_SECONDS.get(timeframe, 86400)

    # Calculate seconds since epoch
    epoch_seconds = int(now.timestamp())

    # Find next candle close time
    current_candle_start = (epoch_seconds // interval) * interval
    next_candle_close = current_candle_start + interval

    # Add 5 second buffer to ensure candle is confirmed
    sleep_seconds = next_candle_close - epoch_seconds + 5

    return max(sleep_seconds, 10)  # At least 10 seconds


def format_duration(seconds: int) -> str:
    """Format seconds as human readable duration."""
    if seconds < 60:
        return f"{seconds}s"
    elif seconds < 3600:
        return f"{seconds // 60}m {seconds % 60}s"
    else:
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        return f"{hours}h {minutes}m"


def run_once(trader: LiveTrader, dry_run: bool) -> dict:
    """Run a single check and trade cycle."""
    logger.info("=" * 60)
    logger.info(f"Checking {trader.config.symbol} with {trader.config.strategy}")

    result = trader.check_and_trade(dry_run=dry_run)

    # Log result
    if "error" in result:
        logger.error(f"Error: {result['error']}")
    else:
        logger.info(f"Signal: {result['signal']} | Action: {result['action']}")
        logger.info(f"Latest close: ${result.get('latest_close', 0):,.2f}")

        if result["action"] == "OPEN_LONG":
            order = result.get("order", {})
            logger.info(f"OPENED: {order.get('filled', 0)} @ ${order.get('average', 0):,.2f}")
        elif result["action"] == "CLOSE_LONG":
            order = result.get("order", {})
            logger.info(f"CLOSED: PnL {result.get('trade_pnl_percent', 0):+.2f}%")
            logger.info(f"Total realized: {result.get('total_realized_pnl', 0):+.2f}%")
        elif "unrealized_pnl_percent" in result:
            logger.info(f"Unrealized PnL: {result['unrealized_pnl_percent']:+.2f}%")

    return result


def run_loop(trader: LiveTrader, dry_run: bool):
    """Run continuous trading loop."""
    logger.info("Starting live trading loop...")
    logger.info(f"Symbol: {trader.config.symbol}")
    logger.info(f"Timeframe: {trader.config.timeframe}")
    logger.info(f"Strategy: {trader.config.strategy}")
    logger.info(f"Testnet: {trader.config.testnet}")
    logger.info(f"Dry run: {dry_run}")
    logger.info("=" * 60)

    while True:
        try:
            # Run check
            run_once(trader, dry_run)

            # Calculate sleep time until next candle
            sleep_seconds = calculate_sleep_until_next_candle(trader.config.timeframe)
            next_check = datetime.now(timezone.utc).timestamp() + sleep_seconds
            next_check_str = datetime.fromtimestamp(next_check, timezone.utc).strftime(
                "%Y-%m-%d %H:%M:%S UTC"
            )

            logger.info(f"Next check in {format_duration(sleep_seconds)} at {next_check_str}")
            logger.info("-" * 60)

            time.sleep(sleep_seconds)

        except KeyboardInterrupt:
            logger.info("Shutting down...")
            break
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            logger.info("Retrying in 60 seconds...")
            time.sleep(60)


def main():
    parser = argparse.ArgumentParser(description="Live trading runner")
    parser.add_argument(
        "--symbol",
        default=os.getenv("TRADING_SYMBOL", "BTC/USDT"),
        help="Trading pair (default: BTC/USDT)",
    )
    parser.add_argument(
        "--timeframe",
        default=os.getenv("TRADING_TIMEFRAME", "1d"),
        choices=list(TIMEFRAME_SECONDS.keys()),
        help="Candle timeframe (default: 1d)",
    )
    parser.add_argument(
        "--strategy",
        default=os.getenv("TRADING_STRATEGY", "cdc-confirmed-sma"),
        choices=["sma-crossover", "cdc-actionzone", "cdc-confirmed-sma"],
        help="Trading strategy (default: cdc-confirmed-sma)",
    )
    parser.add_argument(
        "--testnet",
        action="store_true",
        default=True,
        help="Use testnet (default: True)",
    )
    parser.add_argument(
        "--mainnet",
        action="store_true",
        help="Use mainnet (disables testnet)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Dry run - no actual trades",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run once and exit (no loop)",
    )
    parser.add_argument(
        "--state-file",
        default="trader_state.json",
        help="State file path (default: trader_state.json)",
    )

    args = parser.parse_args()

    # Determine testnet mode
    use_testnet = args.testnet and not args.mainnet

    # Get API credentials
    api_key = os.getenv("BINANCE_API_KEY")
    api_secret = os.getenv("BINANCE_API_SECRET")

    if not args.dry_run and not api_key:
        logger.warning("No BINANCE_API_KEY set - running in dry-run mode")
        args.dry_run = True

    # Create config
    config = TraderConfig(
        symbol=args.symbol,
        timeframe=args.timeframe,
        strategy=args.strategy,
        testnet=use_testnet,
        state_file=args.state_file,
    )

    # Create trader
    trader = LiveTrader(config, api_key=api_key, api_secret=api_secret)

    # Show initial status
    status = trader.get_status()
    if status["state"]["in_position"]:
        logger.info(f"Resuming with open position from {status['state']['entry_time']}")
        logger.info(f"Entry price: ${status['state']['entry_price']:,.2f}")

    # Run
    if args.once:
        run_once(trader, args.dry_run)
    else:
        run_loop(trader, args.dry_run)


if __name__ == "__main__":
    main()
