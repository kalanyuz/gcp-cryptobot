#!/usr/bin/env python3
"""
Market Analysis Tool - Confluence-based decision support.

Combines Elliott Wave, Support/Resistance, Bollinger Bands, and strategy signals
to provide comprehensive market analysis.

Usage:
    # Analyze with live data
    uv run python run_analysis.py --symbol BTC/USDT

    # Analyze with synthetic data (demo)
    uv run python run_analysis.py --demo

    # Different timeframe
    uv run python run_analysis.py --symbol ETH/USDT --timeframe 4h
"""

import argparse
import logging
import math
import random
from datetime import datetime, timezone

import polars as pl

from src.cryptobot.confluence import analyze_confluence, print_confluence_report
from src.cryptobot.exchange import ExchangeClient

logging.basicConfig(level=logging.WARNING)


def generate_demo_candles(
    symbol: str,
    start_price: float = 40000,
    days: int = 100,
    volatility: float = 0.02,
) -> pl.DataFrame:
    """Generate synthetic candles for demo."""

    candles = []
    price = start_price
    timestamp = int(datetime(2024, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
    day_ms = 86400 * 1000

    # Create a trending pattern with waves
    trend = 0.001  # Slight uptrend

    for i in range(days):
        # Add wave-like pattern
        wave = math.sin(i / 20) * 0.01
        daily_return = trend + wave + random.gauss(0, volatility)

        open_price = price
        close_price = price * (1 + daily_return)
        high_price = max(open_price, close_price) * (1 + random.uniform(0, volatility / 2))
        low_price = min(open_price, close_price) * (1 - random.uniform(0, volatility / 2))

        candles.append({
            "timestamp": timestamp,
            "open": open_price,
            "high": high_price,
            "low": low_price,
            "close": close_price,
            "volume": random.uniform(1000, 10000),
        })

        price = close_price
        timestamp += day_ms

    return pl.DataFrame(candles)


def main():
    parser = argparse.ArgumentParser(
        description="Market Analysis Tool - Confluence-based decision support"
    )
    parser.add_argument(
        "--symbol",
        default="BTC/USDT",
        help="Trading pair (default: BTC/USDT)",
    )
    parser.add_argument(
        "--timeframe",
        default="1d",
        help="Candle timeframe (default: 1d)",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Use synthetic demo data",
    )
    parser.add_argument(
        "--candles",
        type=int,
        default=100,
        help="Number of candles to analyze (default: 100)",
    )

    args = parser.parse_args()

    print()
    print(f"  Analyzing {args.symbol} ({args.timeframe})")
    print()

    # Get candle data
    if args.demo:
        print("  Using synthetic demo data...")
        start_prices = {
            "BTC/USDT": 40000,
            "ETH/USDT": 2500,
            "DOGE/USDT": 0.08,
        }
        start_price = start_prices.get(args.symbol, 100)
        candles = generate_demo_candles(args.symbol, start_price, args.candles)
    else:
        print("  Fetching live data from Binance...")
        try:
            client = ExchangeClient(exchange_id="binance", testnet=False)
            candles = client.fetch_candles(
                args.symbol,
                args.timeframe,
                args.candles,
            )
        except Exception as e:
            print(f"  Error fetching data: {e}")
            print("  Falling back to demo data...")
            candles = generate_demo_candles(args.symbol, 40000, args.candles)

    print(f"  Loaded {len(candles)} candles")
    print()

    # Run confluence analysis
    result = analyze_confluence(candles)

    # Print report
    print_confluence_report(result)


if __name__ == "__main__":
    main()
