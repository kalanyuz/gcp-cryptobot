#!/usr/bin/env python3
"""
Direct Strategy Executor - Runs strategy signals without Claude.

Replicates backtest behavior exactly:
- Fetches candles
- Calculates strategy signal
- Executes if BUY/SELL

Usage:
    # Single run with CDC ActionZone
    uv run python run_strategy.py --symbol BTC/USDT --strategy cdc-actionzone

    # Continuous mode (runs at each candle close)
    uv run python run_strategy.py --symbol BTC/USDT --strategy cdc-actionzone --continuous

    # Dry run (no actual trades)
    uv run python run_strategy.py --symbol BTC/USDT --strategy cdc-actionzone --dry-run
"""

import argparse
import json
import os
import time
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()

from src.cryptobot.database import TradingDatabase, Position, Decision
from src.cryptobot.exchange import ExchangeClient
from src.cryptobot.strategies import get_strategy, list_strategies
from src.cryptobot.indicators import atr
from src.cryptobot.entities import Signal


TIMEFRAME_SECONDS = {
    "1m": 60, "5m": 300, "15m": 900, "30m": 1800,
    "1h": 3600, "4h": 14400, "1d": 86400,
}


def run_strategy_signal(
    symbol: str,
    strategy_name: str,
    timeframe: str,
    db_path: str,
    dry_run: bool,
    position_size_pct: float = 50.0,
    stop_loss_atr: float = 2.0,
    take_profit_atr: float = 3.0,
) -> dict:
    """
    Run a single strategy check and execute if signal fires.

    This replicates backtest behavior exactly.
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    result = {
        "timestamp": timestamp,
        "symbol": symbol,
        "strategy": strategy_name,
        "timeframe": timeframe,
        "dry_run": dry_run,
    }

    # Get strategy
    strategy = get_strategy(strategy_name)
    if not strategy:
        result["error"] = f"Unknown strategy: {strategy_name}"
        return result

    strategy.init({})

    # Initialize
    db = TradingDatabase(db_path)

    api_key = os.getenv("BINANCE_API_KEY")
    api_secret = os.getenv("BINANCE_API_SECRET")

    # Fetch candles
    try:
        exchange = ExchangeClient("binance", api_key, api_secret, testnet=False)
        candles = exchange.fetch_candles(symbol, timeframe, limit=100)
    except Exception as e:
        result["error"] = f"Failed to fetch candles: {e}"
        db.close()
        return result

    current_idx = len(candles) - 2  # Use confirmed candle (not forming)
    current_price = candles["close"][current_idx]
    result["price"] = current_price

    # Calculate signal
    signal = strategy.calculate(candles, current_idx)
    result["signal"] = signal.value

    # Check current position
    position = db.get_position_by_symbol(symbol)
    result["has_position"] = position is not None

    # Calculate ATR for stop/take profit
    atr_val = atr(candles, 14, current_idx) or (current_price * 0.02)

    # Execute based on signal
    if signal == Signal.BUY and not position:
        # Open position
        result["action"] = "BUY"

        portfolio = db.get_portfolio_summary()
        available = portfolio.get("available_balance", 10000)
        position_value = available * (position_size_pct / 100)
        quantity = position_value / current_price

        stop_loss = current_price - (stop_loss_atr * atr_val)
        take_profit = current_price + (take_profit_atr * atr_val)

        if not dry_run and api_key:
            try:
                order = exchange.market_buy(symbol, quote_amount=position_value)
                current_price = float(order.get("average", current_price))
                quantity = float(order.get("filled", quantity))
                result["order_id"] = order.get("id")
            except Exception as e:
                result["error"] = f"Order failed: {e}"
                db.close()
                return result

        # Record position
        pos = Position(
            id=None,
            symbol=symbol,
            side="long",
            entry_price=current_price,
            quantity=quantity,
            entry_time=timestamp,
            stop_loss=stop_loss,
            take_profit=take_profit,
        )
        position_id = db.open_position(pos)

        # Log trade
        db.log_trade(position_id, symbol, "long", "BUY", current_price, quantity, timestamp)

        # Log decision
        decision = Decision(
            id=None,
            timestamp=timestamp,
            symbol=symbol,
            action="BUY",
            reasoning=f"Strategy {strategy_name} signaled BUY",
            confidence=1.0,
            market_context={"price": current_price, "strategy": strategy_name},
            executed=True,
            execution_price=current_price,
        )
        db.log_decision(decision)

        result["position_id"] = position_id
        result["entry_price"] = current_price
        result["quantity"] = quantity
        result["stop_loss"] = stop_loss
        result["take_profit"] = take_profit

    elif signal == Signal.SELL and position:
        # Close position
        result["action"] = "SELL"

        if not dry_run and api_key:
            try:
                order = exchange.market_sell(symbol, position.quantity)
                current_price = float(order.get("average", current_price))
                result["order_id"] = order.get("id")
            except Exception as e:
                result["error"] = f"Order failed: {e}"
                db.close()
                return result

        # Close position in DB
        pnl_percent = db.close_position(position.id, current_price, timestamp)

        # Log trade
        db.log_trade(position.id, symbol, "long", "SELL", current_price, position.quantity, timestamp)

        # Log decision
        decision = Decision(
            id=None,
            timestamp=timestamp,
            symbol=symbol,
            action="SELL",
            reasoning=f"Strategy {strategy_name} signaled SELL",
            confidence=1.0,
            market_context={"price": current_price, "entry_price": position.entry_price},
            executed=True,
            execution_price=current_price,
        )
        db.log_decision(decision)

        result["position_id"] = position.id
        result["entry_price"] = position.entry_price
        result["exit_price"] = current_price
        result["pnl_percent"] = pnl_percent

    else:
        # Hold
        result["action"] = "HOLD"

        if position:
            # Calculate unrealized P&L
            pnl = (current_price - position.entry_price) / position.entry_price * 100
            result["unrealized_pnl_percent"] = pnl
            result["position_entry"] = position.entry_price

        # Log decision (optional - can comment out to reduce noise)
        decision = Decision(
            id=None,
            timestamp=timestamp,
            symbol=symbol,
            action="HOLD",
            reasoning=f"Strategy {strategy_name} signaled HOLD",
            confidence=1.0,
            market_context={"price": current_price, "has_position": position is not None},
            executed=False,
            execution_price=None,
        )
        db.log_decision(decision)

    db.close()
    return result


def calculate_next_candle_time(timeframe: str) -> tuple[int, datetime]:
    """Calculate seconds until next candle close."""
    now = datetime.now(timezone.utc)
    interval = TIMEFRAME_SECONDS.get(timeframe, 86400)

    epoch_seconds = int(now.timestamp())
    current_candle_start = (epoch_seconds // interval) * interval
    next_candle_close = current_candle_start + interval

    sleep_seconds = next_candle_close - epoch_seconds + 5
    next_time = datetime.fromtimestamp(next_candle_close, timezone.utc)

    return max(sleep_seconds, 10), next_time


def main():
    parser = argparse.ArgumentParser(description="Direct Strategy Executor")
    parser.add_argument("--symbol", default="BTC/USDT", help="Trading pair")
    parser.add_argument("--strategy", default="cdc-actionzone",
                        choices=[s["name"] for s in list_strategies()],
                        help="Strategy to run")
    parser.add_argument("--timeframe", default="1d", help="Candle timeframe")
    parser.add_argument("--db", default="trading.db", help="Database path")
    parser.add_argument("--dry-run", action="store_true", help="Don't execute trades")
    parser.add_argument("--continuous", action="store_true", help="Run continuously")
    parser.add_argument("--position-size", type=float, default=50.0, help="Position size %")

    args = parser.parse_args()

    # Initialize database if needed
    db = TradingDatabase(args.db)
    portfolio = db.get_portfolio_summary()
    if portfolio.get("total_balance", 0) == 0:
        print("Initializing portfolio with $10,000...")
        db.update_portfolio(10000, 10000, 0, 0)
    db.close()

    print(f"{'='*60}")
    print(f"Direct Strategy Executor")
    print(f"Symbol: {args.symbol}")
    print(f"Strategy: {args.strategy}")
    print(f"Timeframe: {args.timeframe}")
    print(f"Dry run: {args.dry_run}")
    print(f"{'='*60}\n")

    if args.continuous:
        print("Running continuously. Press Ctrl+C to stop.\n")

        while True:
            try:
                result = run_strategy_signal(
                    args.symbol, args.strategy, args.timeframe,
                    args.db, args.dry_run, args.position_size
                )

                print(f"\n[{result['timestamp']}]")
                print(f"Price: ${result.get('price', 0):,.2f}")
                print(f"Signal: {result.get('signal', 'N/A')}")
                print(f"Action: {result.get('action', 'N/A')}")

                if result.get('action') == 'BUY':
                    print(f"  Entry: ${result.get('entry_price', 0):,.2f}")
                    print(f"  Stop: ${result.get('stop_loss', 0):,.2f}")
                    print(f"  Target: ${result.get('take_profit', 0):,.2f}")
                elif result.get('action') == 'SELL':
                    print(f"  Exit: ${result.get('exit_price', 0):,.2f}")
                    print(f"  PnL: {result.get('pnl_percent', 0):+.2f}%")
                elif result.get('unrealized_pnl_percent') is not None:
                    print(f"  Unrealized: {result.get('unrealized_pnl_percent', 0):+.2f}%")

                if result.get('error'):
                    print(f"  ERROR: {result['error']}")

                # Sleep until next candle
                sleep_seconds, next_time = calculate_next_candle_time(args.timeframe)
                print(f"\nNext check: {next_time.isoformat()} ({sleep_seconds}s)")
                time.sleep(sleep_seconds)

            except KeyboardInterrupt:
                print("\nStopping...")
                break
            except Exception as e:
                print(f"Error: {e}")
                time.sleep(60)
    else:
        # Single run
        result = run_strategy_signal(
            args.symbol, args.strategy, args.timeframe,
            args.db, args.dry_run, args.position_size
        )
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
