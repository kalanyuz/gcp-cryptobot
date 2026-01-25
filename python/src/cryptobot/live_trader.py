"""Live trading module - runs strategies on real market data."""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

import polars as pl

from .entities import Signal
from .exchange import ExchangeClient
from .strategies import (
    CDCActionZoneStrategy,
    CDCConfirmedSMAStrategy,
    SMACrossoverStrategy,
)


logger = logging.getLogger(__name__)


@dataclass
class TraderConfig:
    """Configuration for live trader."""

    symbol: str  # e.g., 'BTC/USDT'
    timeframe: str = "1d"  # Candle timeframe
    strategy: str = "cdc-confirmed-sma"  # Strategy to use
    position_size_percent: float = 95.0  # % of balance to use
    candle_history: int = 50  # Number of candles to fetch

    # Exchange settings
    exchange: str = "binance"
    testnet: bool = True  # Use testnet by default for safety

    # State file for persistence
    state_file: str = "trader_state.json"


@dataclass
class TraderState:
    """Persistent state for the trader."""

    in_position: bool = False
    entry_price: float = 0.0
    entry_time: str = ""
    position_size: float = 0.0
    last_signal: str = "HOLD"
    last_check: str = ""
    total_trades: int = 0
    realized_pnl: float = 0.0

    def to_dict(self) -> dict:
        return {
            "in_position": self.in_position,
            "entry_price": self.entry_price,
            "entry_time": self.entry_time,
            "position_size": self.position_size,
            "last_signal": self.last_signal,
            "last_check": self.last_check,
            "total_trades": self.total_trades,
            "realized_pnl": self.realized_pnl,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "TraderState":
        return cls(**data)


class LiveTrader:
    """Live trader that runs strategies on real market data."""

    STRATEGIES = {
        "sma-crossover": SMACrossoverStrategy,
        "cdc-actionzone": CDCActionZoneStrategy,
        "cdc-confirmed-sma": CDCConfirmedSMAStrategy,
    }

    def __init__(
        self,
        config: TraderConfig,
        api_key: str | None = None,
        api_secret: str | None = None,
    ):
        self.config = config
        self.exchange = ExchangeClient(
            exchange_id=config.exchange,
            api_key=api_key,
            api_secret=api_secret,
            testnet=config.testnet,
        )

        # Initialize strategy
        strategy_class = self.STRATEGIES.get(config.strategy)
        if not strategy_class:
            raise ValueError(f"Unknown strategy: {config.strategy}")
        self.strategy = strategy_class()

        # Load or create state
        self.state = self._load_state()

    def _load_state(self) -> TraderState:
        """Load state from file or create new."""
        state_path = Path(self.config.state_file)
        if state_path.exists():
            try:
                data = json.loads(state_path.read_text())
                logger.info(f"Loaded state from {state_path}")
                return TraderState.from_dict(data)
            except Exception as e:
                logger.warning(f"Failed to load state: {e}")
        return TraderState()

    def _save_state(self):
        """Save state to file."""
        state_path = Path(self.config.state_file)
        state_path.write_text(json.dumps(self.state.to_dict(), indent=2))
        logger.debug(f"Saved state to {state_path}")

    def check_and_trade(self, dry_run: bool = False) -> dict:
        """Check current market and execute trade if signal fires.

        Args:
            dry_run: If True, don't execute actual trades

        Returns:
            Dict with action taken and details
        """
        result = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "symbol": self.config.symbol,
            "strategy": self.config.strategy,
            "action": "HOLD",
            "signal": "HOLD",
            "dry_run": dry_run,
        }

        # Fetch candles
        try:
            candles = self.exchange.fetch_candles(
                self.config.symbol,
                self.config.timeframe,
                self.config.candle_history,
            )
        except Exception as e:
            result["error"] = f"Failed to fetch candles: {e}"
            logger.error(result["error"])
            return result

        result["candles_fetched"] = len(candles)
        result["latest_close"] = candles["close"][-1]

        # Calculate signal on the last confirmed candle (index -2)
        # The latest candle (index -1) is still forming
        confirmed_index = len(candles) - 2
        signal = self.strategy.calculate(candles, confirmed_index)
        result["signal"] = signal.value

        self.state.last_signal = signal.value
        self.state.last_check = result["timestamp"]

        # Determine action based on signal and current position
        if signal == Signal.BUY and not self.state.in_position:
            result["action"] = "OPEN_LONG"
            if not dry_run:
                self._open_position(candles["close"][confirmed_index], result)
        elif signal == Signal.SELL and self.state.in_position:
            result["action"] = "CLOSE_LONG"
            if not dry_run:
                self._close_position(candles["close"][confirmed_index], result)
        else:
            result["action"] = "HOLD"
            if self.state.in_position:
                result["unrealized_pnl_percent"] = (
                    (candles["close"][-1] - self.state.entry_price)
                    / self.state.entry_price
                    * 100
                )

        self._save_state()

        return result

    def _open_position(self, price: float, result: dict):
        """Open a long position."""
        try:
            # Get available balance
            quote_asset = self.config.symbol.split("/")[1]
            balance = self.exchange.get_balance(quote_asset)
            available = balance.get("free", 0)

            if available <= 0:
                result["error"] = f"No {quote_asset} balance available"
                return

            # Calculate position size
            quote_amount = available * (self.config.position_size_percent / 100)

            # Execute buy
            order = self.exchange.market_buy(
                self.config.symbol, quote_amount=quote_amount
            )

            # Update state
            self.state.in_position = True
            self.state.entry_price = float(order.get("average", price))
            self.state.entry_time = datetime.now(timezone.utc).isoformat()
            self.state.position_size = float(order.get("filled", 0))
            self.state.total_trades += 1

            result["order"] = {
                "id": order.get("id"),
                "filled": order.get("filled"),
                "average": order.get("average"),
                "cost": order.get("cost"),
            }

            logger.info(
                f"OPENED position: {self.state.position_size} @ {self.state.entry_price}"
            )

        except Exception as e:
            result["error"] = f"Failed to open position: {e}"
            logger.error(result["error"])

    def _close_position(self, price: float, result: dict):
        """Close the current position."""
        try:
            if self.state.position_size <= 0:
                result["error"] = "No position to close"
                return

            # Execute sell
            order = self.exchange.market_sell(
                self.config.symbol, self.state.position_size
            )

            # Calculate PnL
            exit_price = float(order.get("average", price))
            pnl_percent = (exit_price - self.state.entry_price) / self.state.entry_price * 100
            self.state.realized_pnl += pnl_percent

            result["order"] = {
                "id": order.get("id"),
                "filled": order.get("filled"),
                "average": order.get("average"),
                "cost": order.get("cost"),
            }
            result["trade_pnl_percent"] = pnl_percent
            result["total_realized_pnl"] = self.state.realized_pnl

            logger.info(
                f"CLOSED position @ {exit_price}, PnL: {pnl_percent:+.2f}%"
            )

            # Reset position state
            self.state.in_position = False
            self.state.entry_price = 0.0
            self.state.entry_time = ""
            self.state.position_size = 0.0
            self.state.total_trades += 1

        except Exception as e:
            result["error"] = f"Failed to close position: {e}"
            logger.error(result["error"])

    def get_status(self) -> dict:
        """Get current trader status."""
        return {
            "config": {
                "symbol": self.config.symbol,
                "timeframe": self.config.timeframe,
                "strategy": self.config.strategy,
                "testnet": self.config.testnet,
            },
            "state": self.state.to_dict(),
        }
