#!/usr/bin/env python3
"""
Strategy Backtest Runner

Compares the 3 core strategies on historical data:
1. SMA Crossover - Best for clean trending markets
2. CDC ActionZone - Filtered signals for choppy markets
3. CDC-Confirmed SMA - Hybrid: best for volatile assets
"""

import random
from datetime import datetime
import polars as pl

from src.cryptobot import (
    BacktestService,
    BacktestConfig,
    get_strategy,
    list_strategies,
)


# Sample BTC monthly prices for testing
BTC_MONTHLY = {
    "2020-01": 9350, "2020-02": 8600, "2020-03": 6400, "2020-04": 8800,
    "2020-05": 9450, "2020-06": 9150, "2020-07": 11350, "2020-08": 11650,
    "2020-09": 10800, "2020-10": 13800, "2020-11": 19700, "2020-12": 29000,
    "2021-01": 33100, "2021-02": 45200, "2021-03": 58800, "2021-04": 57800,
    "2021-05": 37300, "2021-06": 35000, "2021-07": 41500, "2021-08": 47100,
    "2021-09": 43800, "2021-10": 61300, "2021-11": 57000, "2021-12": 46300,
    "2022-01": 38500, "2022-02": 43200, "2022-03": 45500, "2022-04": 37600,
    "2022-05": 31800, "2022-06": 19800, "2022-07": 23300, "2022-08": 20050,
    "2022-09": 19400, "2022-10": 20500, "2022-11": 17150, "2022-12": 16500,
    "2023-01": 23100, "2023-02": 23500, "2023-03": 28500, "2023-04": 29300,
    "2023-05": 27200, "2023-06": 30500, "2023-07": 29200, "2023-08": 26000,
    "2023-09": 27000, "2023-10": 34500, "2023-11": 37700, "2023-12": 42500,
    "2024-01": 42500, "2024-02": 62000, "2024-03": 71000, "2024-04": 60000,
    "2024-05": 68000, "2024-06": 62500, "2024-07": 66000, "2024-08": 59000,
    "2024-09": 63500, "2024-10": 70000, "2024-11": 97000, "2024-12": 93500,
    "2025-01": 102000,
}

# Sample DOGE monthly prices for testing
DOGE_MONTHLY = {
    "2020-01": 0.0023, "2020-02": 0.0024, "2020-03": 0.0019, "2020-04": 0.0025,
    "2020-05": 0.0026, "2020-06": 0.0025, "2020-07": 0.0032, "2020-08": 0.0034,
    "2020-09": 0.0026, "2020-10": 0.0026, "2020-11": 0.0034, "2020-12": 0.0047,
    "2021-01": 0.048, "2021-02": 0.052, "2021-03": 0.055, "2021-04": 0.26,
    "2021-05": 0.31, "2021-06": 0.25, "2021-07": 0.21, "2021-08": 0.29,
    "2021-09": 0.21, "2021-10": 0.27, "2021-11": 0.22, "2021-12": 0.17,
    "2022-01": 0.15, "2022-02": 0.12, "2022-03": 0.14, "2022-04": 0.14,
    "2022-05": 0.085, "2022-06": 0.067, "2022-07": 0.070, "2022-08": 0.063,
    "2022-09": 0.060, "2022-10": 0.12, "2022-11": 0.10, "2022-12": 0.07,
    "2023-01": 0.086, "2023-02": 0.083, "2023-03": 0.076, "2023-04": 0.073,
    "2023-05": 0.072, "2023-06": 0.065, "2023-07": 0.078, "2023-08": 0.063,
    "2023-09": 0.061, "2023-10": 0.068, "2023-11": 0.082, "2023-12": 0.091,
    "2024-01": 0.083, "2024-02": 0.13, "2024-03": 0.20, "2024-04": 0.15,
    "2024-05": 0.16, "2024-06": 0.13, "2024-07": 0.13, "2024-08": 0.10,
    "2024-09": 0.11, "2024-10": 0.14, "2024-11": 0.40, "2024-12": 0.32,
    "2025-01": 0.35,
}


def generate_candles(monthly_prices: dict[str, float], volatility: float = 0.03) -> pl.DataFrame:
    """Generate daily candles from monthly price data."""
    candles = []
    months = sorted(monthly_prices.keys())

    for i in range(len(months) - 1):
        start_price = monthly_prices[months[i]]
        end_price = monthly_prices[months[i + 1]]
        year, month = map(int, months[i].split("-"))

        # Days in month
        if month == 12:
            next_month = datetime(year + 1, 1, 1)
        else:
            next_month = datetime(year, month + 1, 1)
        days_in_month = (next_month - datetime(year, month, 1)).days

        daily_change = (end_price - start_price) / days_in_month

        for day in range(1, days_in_month + 1):
            base_price = start_price + daily_change * day
            noise = (random.random() - 0.5) * base_price * volatility

            timestamp = int(datetime(year, month, day).timestamp() * 1000)
            open_price = base_price + noise * 0.3
            close_price = base_price + noise * 0.7
            high_price = max(open_price, close_price) + abs(noise) * 0.3
            low_price = min(open_price, close_price) - abs(noise) * 0.3
            volume = 10000 + random.random() * 20000

            candles.append({
                "timestamp": timestamp,
                "open": open_price,
                "high": high_price,
                "low": low_price,
                "close": close_price,
                "volume": volume,
            })

    return pl.DataFrame(candles)


def run_backtest(candles: pl.DataFrame, strategy_name: str, symbol: str):
    """Run a backtest for a given strategy."""
    strategy = get_strategy(strategy_name)
    if not strategy:
        return None

    strategy.init({})

    config = BacktestConfig(
        symbol=symbol,
        timeframe="1d",
        initial_capital=10000.0,
        position_size_percent=95.0,
        commission=0.001,
        slippage=0.001,
    )

    service = BacktestService()
    return service.run_backtest(candles, strategy, config)


def print_table_row(name: str, m):
    """Print a formatted table row."""
    pf = "∞" if m.profit_factor == float("inf") else f"{m.profit_factor:.1f}"
    sortino = "∞" if m.sortino_ratio == float("inf") else f"{m.sortino_ratio:.2f}"

    print(
        f"  {name:<20}│"
        f"{f'+{m.total_pnl_percent:.0f}%':>10}│"
        f"{m.total_trades:>7}│"
        f"{f'{m.win_rate:.0f}%':>6}│"
        f"{pf:>6}│"
        f"{f'{m.max_drawdown_percent:.0f}%':>6}│"
        f"{m.sharpe_ratio:>7.2f}│"
        f"{sortino:>8}"
    )


def main():
    print("═" * 80)
    print("  STRATEGY COMPARISON (Python/Polars)")
    print("═" * 80)

    # List strategies
    print("\n  Available Strategies:")
    for i, s in enumerate(list_strategies(), 1):
        print(f"    {i}. {s['name']}: {s['description']}")

    # Test on BTC
    print("\n" + "─" * 80)
    print("  BTCUSDT (2020-2025) - Clean trending market")
    print("─" * 80)

    btc_candles = generate_candles(BTC_MONTHLY, 0.025)
    print(f"  Generated {len(btc_candles)} daily candles\n")

    print(f"  {'Strategy':<20}│{'Return':>10}│{'Trades':>7}│{'Win%':>6}│{'PF':>6}│{'MaxDD':>6}│{'Sharpe':>7}│{'Sortino':>8}")
    print("  " + "─" * 78)

    for s in list_strategies():
        result = run_backtest(btc_candles, s["name"], "BTCUSDT")
        if result:
            print_table_row(s["name"], result.metrics)

    # Test on DOGE
    print("\n" + "─" * 80)
    print("  DOGEUSDT (2020-2025) - Volatile meme coin")
    print("─" * 80)

    doge_candles = generate_candles(DOGE_MONTHLY, 0.07)
    print(f"  Generated {len(doge_candles)} daily candles\n")

    print(f"  {'Strategy':<20}│{'Return':>10}│{'Trades':>7}│{'Win%':>6}│{'PF':>6}│{'MaxDD':>6}│{'Sharpe':>7}│{'Sortino':>8}")
    print("  " + "─" * 78)

    for s in list_strategies():
        result = run_backtest(doge_candles, s["name"], "DOGEUSDT")
        if result:
            print_table_row(s["name"], result.metrics)

    print("\n" + "═" * 80)
    print("  RECOMMENDATION")
    print("═" * 80)
    print("""
  • BTC/ETH (clean trends):     Use sma-crossover
  • DOGE/meme coins (volatile): Use cdc-confirmed-sma
  • Unknown market:             Use cdc-actionzone (safer)
    """)


if __name__ == "__main__":
    main()
