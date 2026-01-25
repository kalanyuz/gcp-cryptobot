"""
Core entities for backtesting.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol
import polars as pl


class Signal(Enum):
    """Trading signal."""
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


@dataclass
class Trade:
    """A single trade in the backtest."""
    entry_time: int  # Unix timestamp ms
    entry_price: float
    side: str  # 'long' or 'short'
    size: float
    exit_time: int | None = None
    exit_price: float | None = None
    pnl: float | None = None
    pnl_percent: float | None = None


@dataclass
class BacktestConfig:
    """Backtest configuration."""
    symbol: str
    timeframe: str
    initial_capital: float = 10000.0
    position_size_percent: float = 95.0  # % of capital per trade
    commission: float = 0.001  # 0.1%
    slippage: float = 0.001  # 0.1%


@dataclass
class BacktestMetrics:
    """Performance metrics from a backtest."""
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    total_pnl: float = 0.0
    total_pnl_percent: float = 0.0
    average_win: float = 0.0
    average_loss: float = 0.0
    largest_win: float = 0.0
    largest_loss: float = 0.0
    profit_factor: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_percent: float = 0.0
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    avg_holding_period_ms: float = 0.0


@dataclass
class BacktestResult:
    """Complete backtest results."""
    config: BacktestConfig
    trades: list[Trade]
    metrics: BacktestMetrics
    equity_curve: pl.DataFrame  # columns: timestamp, equity


class Strategy(Protocol):
    """Protocol for trading strategies."""

    name: str
    description: str

    def calculate(self, candles: pl.DataFrame, index: int) -> Signal:
        """
        Calculate the signal for the current candle.

        Args:
            candles: DataFrame with columns: timestamp, open, high, low, close, volume
            index: Current candle index

        Returns:
            Trading signal
        """
        ...

    def init(self, params: dict | None = None) -> None:
        """Initialize strategy with parameters."""
        ...


def create_candles_df(data: list[dict]) -> pl.DataFrame:
    """Create a candles DataFrame from a list of dicts."""
    return pl.DataFrame(data).select([
        pl.col("timestamp").cast(pl.Int64),
        pl.col("open").cast(pl.Float64),
        pl.col("high").cast(pl.Float64),
        pl.col("low").cast(pl.Float64),
        pl.col("close").cast(pl.Float64),
        pl.col("volume").cast(pl.Float64),
    ])
