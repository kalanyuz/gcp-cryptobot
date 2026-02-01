#!/usr/bin/env python3
"""
Trading Action CLI - Commands Claude Code can execute.

Usage:
    # Get market state (JSON)
    uv run python trade.py market --symbol BTC/USDT

    # Execute buy
    uv run python trade.py buy --symbol BTC/USDT --size 50 --stop-loss 2.0 --reason "Wave 2 setup"

    # Execute sell
    uv run python trade.py sell --symbol BTC/USDT --reason "Wave 5 exhaustion"

    # Get position status
    uv run python trade.py status --symbol BTC/USDT

    # Get portfolio summary
    uv run python trade.py portfolio

    # Log a decision (without executing)
    uv run python trade.py decide --symbol BTC/USDT --action HOLD --reason "Waiting for confirmation"
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()

from src.cryptobot.database import TradingDatabase, Position, Decision
from src.cryptobot.exchange import ExchangeClient
from src.cryptobot.market_state import generate_market_state


def cmd_market(args):
    """Output market state as JSON."""
    try:
        state = generate_market_state(
            symbol=args.symbol,
            timeframe=args.timeframe,
            db_path=args.db,
        )
        print(state.to_json())
    except Exception as e:
        print(json.dumps({"error": str(e), "symbol": args.symbol}))
        sys.exit(1)


def cmd_buy(args):
    """Execute a buy order."""
    db = TradingDatabase(args.db)
    timestamp = datetime.now(timezone.utc).isoformat()

    # Check if already in position
    existing = db.get_position_by_symbol(args.symbol)
    if existing:
        result = {
            "success": False,
            "error": f"Already in position for {args.symbol}",
            "position_id": existing.id,
            "entry_price": existing.entry_price,
        }
        print(json.dumps(result, indent=2))
        db.close()
        return

    # Get current price
    api_key = os.getenv("BINANCE_API_KEY")
    api_secret = os.getenv("BINANCE_API_SECRET")

    if args.dry_run or not api_key:
        # Dry run - simulate
        try:
            exchange = ExchangeClient("binance", testnet=False)
            candles = exchange.fetch_candles(args.symbol, "1d", 1)
            current_price = candles["close"][0]
        except:
            current_price = 100000  # Fallback for testing

        # Calculate position size
        portfolio = db.get_portfolio_summary()
        available = portfolio.get("available_balance", 10000)
        position_value = available * (args.size / 100)
        quantity = position_value / current_price

        # Calculate stop loss price
        stop_loss_price = current_price * (1 - args.stop_loss / 100) if args.stop_loss else None
        take_profit_price = current_price * (1 + args.take_profit / 100) if args.take_profit else None

        # Open position in DB
        position = Position(
            id=None,
            symbol=args.symbol,
            side="long",
            entry_price=current_price,
            quantity=quantity,
            entry_time=timestamp,
            stop_loss=stop_loss_price,
            take_profit=take_profit_price,
        )
        position_id = db.open_position(position)

        # Log trade
        db.log_trade(
            position_id=position_id,
            symbol=args.symbol,
            side="long",
            action="BUY",
            price=current_price,
            quantity=quantity,
            timestamp=timestamp,
        )

        # Log decision
        decision = Decision(
            id=None,
            timestamp=timestamp,
            symbol=args.symbol,
            action="BUY",
            reasoning=args.reason or "Buy signal",
            confidence=args.confidence,
            market_context={"price": current_price, "size_percent": args.size},
            executed=True,
            execution_price=current_price,
        )
        db.log_decision(decision)

        result = {
            "success": True,
            "dry_run": True,
            "action": "BUY",
            "symbol": args.symbol,
            "position_id": position_id,
            "entry_price": current_price,
            "quantity": quantity,
            "position_value": position_value,
            "stop_loss": stop_loss_price,
            "take_profit": take_profit_price,
            "reason": args.reason,
        }
    else:
        # Live execution
        exchange = ExchangeClient("binance", api_key, api_secret, testnet=args.testnet)

        # Get balance and calculate size
        quote_asset = args.symbol.split("/")[1]
        balance = exchange.get_balance(quote_asset)
        available = balance.get("free", 0)
        position_value = available * (args.size / 100)

        # Execute buy
        try:
            order = exchange.market_buy(args.symbol, quote_amount=position_value)
            current_price = float(order.get("average", 0))
            quantity = float(order.get("filled", 0))

            # Calculate stop loss price
            stop_loss_price = current_price * (1 - args.stop_loss / 100) if args.stop_loss else None
            take_profit_price = current_price * (1 + args.take_profit / 100) if args.take_profit else None

            # Record in DB
            position = Position(
                id=None,
                symbol=args.symbol,
                side="long",
                entry_price=current_price,
                quantity=quantity,
                entry_time=timestamp,
                stop_loss=stop_loss_price,
                take_profit=take_profit_price,
            )
            position_id = db.open_position(position)

            db.log_trade(
                position_id=position_id,
                symbol=args.symbol,
                side="long",
                action="BUY",
                price=current_price,
                quantity=quantity,
                timestamp=timestamp,
                order_id=order.get("id"),
            )

            decision = Decision(
                id=None,
                timestamp=timestamp,
                symbol=args.symbol,
                action="BUY",
                reasoning=args.reason or "Buy signal",
                confidence=args.confidence,
                market_context={"price": current_price, "order": order},
                executed=True,
                execution_price=current_price,
            )
            db.log_decision(decision)

            result = {
                "success": True,
                "dry_run": False,
                "action": "BUY",
                "symbol": args.symbol,
                "position_id": position_id,
                "entry_price": current_price,
                "quantity": quantity,
                "position_value": position_value,
                "stop_loss": stop_loss_price,
                "take_profit": take_profit_price,
                "order_id": order.get("id"),
                "reason": args.reason,
            }
        except Exception as e:
            result = {"success": False, "error": str(e)}

    print(json.dumps(result, indent=2))
    db.close()


def cmd_sell(args):
    """Execute a sell order (close position)."""
    db = TradingDatabase(args.db)
    timestamp = datetime.now(timezone.utc).isoformat()

    # Check if in position
    position = db.get_position_by_symbol(args.symbol)
    if not position:
        result = {
            "success": False,
            "error": f"No open position for {args.symbol}",
        }
        print(json.dumps(result, indent=2))
        db.close()
        return

    api_key = os.getenv("BINANCE_API_KEY")
    api_secret = os.getenv("BINANCE_API_SECRET")

    if args.dry_run or not api_key:
        # Dry run - simulate
        try:
            exchange = ExchangeClient("binance", testnet=False)
            candles = exchange.fetch_candles(args.symbol, "1d", 1)
            current_price = candles["close"][0]
        except:
            current_price = position.entry_price * 1.05  # Simulate 5% gain

        # Close position
        pnl_percent = db.close_position(position.id, current_price, timestamp)

        # Log trade
        db.log_trade(
            position_id=position.id,
            symbol=args.symbol,
            side="long",
            action="SELL",
            price=current_price,
            quantity=position.quantity,
            timestamp=timestamp,
        )

        # Log decision
        decision = Decision(
            id=None,
            timestamp=timestamp,
            symbol=args.symbol,
            action="SELL",
            reasoning=args.reason or "Sell signal",
            confidence=args.confidence,
            market_context={"price": current_price, "entry_price": position.entry_price},
            executed=True,
            execution_price=current_price,
        )
        db.log_decision(decision)

        result = {
            "success": True,
            "dry_run": True,
            "action": "SELL",
            "symbol": args.symbol,
            "position_id": position.id,
            "entry_price": position.entry_price,
            "exit_price": current_price,
            "quantity": position.quantity,
            "pnl_percent": pnl_percent,
            "reason": args.reason,
        }
    else:
        # Live execution
        exchange = ExchangeClient("binance", api_key, api_secret, testnet=args.testnet)

        try:
            order = exchange.market_sell(args.symbol, position.quantity)
            current_price = float(order.get("average", 0))

            pnl_percent = db.close_position(position.id, current_price, timestamp)

            db.log_trade(
                position_id=position.id,
                symbol=args.symbol,
                side="long",
                action="SELL",
                price=current_price,
                quantity=position.quantity,
                timestamp=timestamp,
                order_id=order.get("id"),
            )

            decision = Decision(
                id=None,
                timestamp=timestamp,
                symbol=args.symbol,
                action="SELL",
                reasoning=args.reason or "Sell signal",
                confidence=args.confidence,
                market_context={"price": current_price, "order": order},
                executed=True,
                execution_price=current_price,
            )
            db.log_decision(decision)

            result = {
                "success": True,
                "dry_run": False,
                "action": "SELL",
                "symbol": args.symbol,
                "position_id": position.id,
                "entry_price": position.entry_price,
                "exit_price": current_price,
                "quantity": position.quantity,
                "pnl_percent": pnl_percent,
                "order_id": order.get("id"),
                "reason": args.reason,
            }
        except Exception as e:
            result = {"success": False, "error": str(e)}

    print(json.dumps(result, indent=2))
    db.close()


def cmd_status(args):
    """Get position status."""
    db = TradingDatabase(args.db)

    position = db.get_position_by_symbol(args.symbol)

    if position:
        # Get current price for P&L
        try:
            exchange = ExchangeClient("binance", testnet=False)
            candles = exchange.fetch_candles(args.symbol, "1d", 1)
            current_price = candles["close"][0]
            pnl_percent = (current_price - position.entry_price) / position.entry_price * 100
        except:
            current_price = None
            pnl_percent = None

        result = {
            "has_position": True,
            "symbol": args.symbol,
            "position_id": position.id,
            "side": position.side,
            "entry_price": position.entry_price,
            "quantity": position.quantity,
            "entry_time": position.entry_time,
            "stop_loss": position.stop_loss,
            "take_profit": position.take_profit,
            "current_price": current_price,
            "unrealized_pnl_percent": pnl_percent,
        }
    else:
        result = {
            "has_position": False,
            "symbol": args.symbol,
        }

    print(json.dumps(result, indent=2))
    db.close()


def cmd_portfolio(args):
    """Get portfolio summary."""
    db = TradingDatabase(args.db)

    portfolio = db.get_portfolio_summary()
    stats = db.get_performance_stats()

    result = {
        "portfolio": portfolio,
        "performance": stats,
    }

    print(json.dumps(result, indent=2))
    db.close()


def cmd_decide(args):
    """Log a decision without executing."""
    db = TradingDatabase(args.db)
    timestamp = datetime.now(timezone.utc).isoformat()

    decision = Decision(
        id=None,
        timestamp=timestamp,
        symbol=args.symbol,
        action=args.action,
        reasoning=args.reason,
        confidence=args.confidence,
        market_context={},
        executed=False,
        execution_price=None,
    )

    decision_id = db.log_decision(decision)

    result = {
        "success": True,
        "decision_id": decision_id,
        "action": args.action,
        "symbol": args.symbol,
        "reason": args.reason,
        "executed": False,
    }

    print(json.dumps(result, indent=2))
    db.close()


def cmd_history(args):
    """Get decision history."""
    db = TradingDatabase(args.db)

    decisions = db.get_recent_decisions(args.symbol, args.limit)

    print(json.dumps(decisions, indent=2))
    db.close()


def cmd_init(args):
    """Initialize portfolio with starting balance."""
    db = TradingDatabase(args.db)

    db.update_portfolio(
        total_balance=args.balance,
        available_balance=args.balance,
        unrealized_pnl=0,
        realized_pnl=0,
    )

    result = {
        "success": True,
        "initial_balance": args.balance,
        "message": f"Portfolio initialized with ${args.balance:,.2f}",
    }

    print(json.dumps(result, indent=2))
    db.close()


def main():
    parser = argparse.ArgumentParser(description="Trading Action CLI")
    parser.add_argument("--db", default="trading.db", help="Database path")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without executing")
    parser.add_argument("--testnet", action="store_true", help="Use exchange testnet")

    subparsers = parser.add_subparsers(dest="command", required=True)

    # market command
    p_market = subparsers.add_parser("market", help="Get market state")
    p_market.add_argument("--symbol", default="BTC/USDT", help="Trading pair")
    p_market.add_argument("--timeframe", default="1d", help="Candle timeframe")
    p_market.set_defaults(func=cmd_market)

    # buy command
    p_buy = subparsers.add_parser("buy", help="Execute buy order")
    p_buy.add_argument("--symbol", required=True, help="Trading pair")
    p_buy.add_argument("--size", type=float, default=50, help="Position size (% of available)")
    p_buy.add_argument("--stop-loss", type=float, help="Stop loss (% below entry)")
    p_buy.add_argument("--take-profit", type=float, help="Take profit (% above entry)")
    p_buy.add_argument("--reason", help="Reason for trade")
    p_buy.add_argument("--confidence", type=float, default=0.5, help="Confidence (0-1)")
    p_buy.set_defaults(func=cmd_buy)

    # sell command
    p_sell = subparsers.add_parser("sell", help="Execute sell order (close position)")
    p_sell.add_argument("--symbol", required=True, help="Trading pair")
    p_sell.add_argument("--reason", help="Reason for trade")
    p_sell.add_argument("--confidence", type=float, default=0.5, help="Confidence (0-1)")
    p_sell.set_defaults(func=cmd_sell)

    # status command
    p_status = subparsers.add_parser("status", help="Get position status")
    p_status.add_argument("--symbol", required=True, help="Trading pair")
    p_status.set_defaults(func=cmd_status)

    # portfolio command
    p_portfolio = subparsers.add_parser("portfolio", help="Get portfolio summary")
    p_portfolio.set_defaults(func=cmd_portfolio)

    # decide command
    p_decide = subparsers.add_parser("decide", help="Log decision without executing")
    p_decide.add_argument("--symbol", required=True, help="Trading pair")
    p_decide.add_argument("--action", required=True, choices=["BUY", "SELL", "HOLD"])
    p_decide.add_argument("--reason", required=True, help="Reasoning")
    p_decide.add_argument("--confidence", type=float, default=0.5, help="Confidence (0-1)")
    p_decide.set_defaults(func=cmd_decide)

    # history command
    p_history = subparsers.add_parser("history", help="Get decision history")
    p_history.add_argument("--symbol", help="Filter by symbol")
    p_history.add_argument("--limit", type=int, default=10, help="Number of records")
    p_history.set_defaults(func=cmd_history)

    # init command
    p_init = subparsers.add_parser("init", help="Initialize portfolio")
    p_init.add_argument("--balance", type=float, default=10000, help="Starting balance")
    p_init.set_defaults(func=cmd_init)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
