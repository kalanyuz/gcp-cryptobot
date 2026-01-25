"""
Cryptobot - Python backtesting and live trading engine.

Usage (Backtest):
    from cryptobot import BacktestService, BacktestConfig, get_strategy

    strategy = get_strategy("sma-crossover")
    config = BacktestConfig(symbol="BTCUSDT", timeframe="1d")
    result = BacktestService().run_backtest(candles, strategy, config)

Usage (Live Trading):
    from cryptobot import LiveTrader, TraderConfig

    config = TraderConfig(symbol="BTC/USDT", strategy="cdc-confirmed-sma")
    trader = LiveTrader(config, api_key="...", api_secret="...")
    result = trader.check_and_trade()
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
from .exchange import ExchangeClient
from .live_trader import LiveTrader, TraderConfig, TraderState

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
    # Exchange
    "ExchangeClient",
    # Live Trading
    "LiveTrader",
    "TraderConfig",
    "TraderState",
]
