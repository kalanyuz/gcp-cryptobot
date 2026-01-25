"""
Cryptobot Backtest - Python backtesting engine.

Usage:
    from cryptobot import BacktestService, BacktestConfig, get_strategy, list_strategies

    strategy = get_strategy("sma-crossover")
    config = BacktestConfig(symbol="BTCUSDT", timeframe="1d")
    result = BacktestService().run_backtest(candles, strategy, config)
"""

from .entities import (
    Signal,
    Trade,
    BacktestConfig,
    BacktestMetrics,
    BacktestResult,
    create_candles_df,
)
from .indicators import sma, ema, atr, rsi, sma_series, ema_series, atr_series
from .strategies import (
    SMACrossoverStrategy,
    CDCActionZoneStrategy,
    CDCConfirmedSMAStrategy,
    get_strategy,
    list_strategies,
)
from .backtest import BacktestService

__all__ = [
    # Entities
    "Signal",
    "Trade",
    "BacktestConfig",
    "BacktestMetrics",
    "BacktestResult",
    "create_candles_df",
    # Indicators
    "sma",
    "ema",
    "atr",
    "rsi",
    "sma_series",
    "ema_series",
    "atr_series",
    # Strategies
    "SMACrossoverStrategy",
    "CDCActionZoneStrategy",
    "CDCConfirmedSMAStrategy",
    "get_strategy",
    "list_strategies",
    # Backtest
    "BacktestService",
]
