"""
Trading strategies.

Available strategies:
1. SMA Crossover - Best for clean trending markets (BTC)
2. CDC ActionZone - Filtered signals with zone confirmation
3. CDC-Confirmed SMA - Hybrid best for volatile assets (DOGE)
"""

from enum import Enum
import polars as pl
from .entities import Signal
from .indicators import sma, ema


class CDCZone(Enum):
    """CDC ActionZone color zones."""
    GREEN = "GREEN"    # Buy zone: fast EMA > slow EMA AND price > fast EMA
    BLUE = "BLUE"      # Pre-buy 2
    AQUA = "AQUA"      # Pre-buy 1
    RED = "RED"        # Sell zone: fast EMA < slow EMA AND price < fast EMA
    ORANGE = "ORANGE"  # Pre-sell 2
    YELLOW = "YELLOW"  # Pre-sell 1


def get_cdc_zone(price: float, fast_ema: float, slow_ema: float) -> CDCZone:
    """Determine the CDC zone based on price and EMA positions."""
    long_trend = fast_ema > slow_ema
    short_trend = fast_ema < slow_ema

    if long_trend and price > fast_ema:
        return CDCZone.GREEN
    if short_trend and price > fast_ema and price > slow_ema:
        return CDCZone.BLUE
    if short_trend and price > fast_ema and price < slow_ema:
        return CDCZone.AQUA
    if short_trend and price < fast_ema:
        return CDCZone.RED
    if long_trend and price < fast_ema and price < slow_ema:
        return CDCZone.ORANGE
    if long_trend and price < fast_ema and price > slow_ema:
        return CDCZone.YELLOW

    return CDCZone.YELLOW


class SMACrossoverStrategy:
    """
    SMA Crossover Strategy.

    Buy when fast SMA crosses above slow SMA.
    Sell when fast SMA crosses below slow SMA.

    Best for: Clean trending markets (BTC, ETH)
    """

    name = "sma-crossover"
    description = "SMA Crossover - Fast & simple, best for trending markets"

    def __init__(self):
        self.fast_period = 10
        self.slow_period = 20

    def init(self, params: dict | None = None) -> None:
        if params:
            self.fast_period = params.get("fast_period", 10)
            self.slow_period = params.get("slow_period", 20)

    def calculate(self, candles: pl.DataFrame, index: int) -> Signal:
        if index < self.slow_period:
            return Signal.HOLD

        fast_sma = sma(candles, self.fast_period, index)
        slow_sma = sma(candles, self.slow_period, index)
        prev_fast_sma = sma(candles, self.fast_period, index - 1)
        prev_slow_sma = sma(candles, self.slow_period, index - 1)

        if not all([fast_sma, slow_sma, prev_fast_sma, prev_slow_sma]):
            return Signal.HOLD

        # Bullish crossover
        if prev_fast_sma <= prev_slow_sma and fast_sma > slow_sma:
            return Signal.BUY

        # Bearish crossover
        if prev_fast_sma >= prev_slow_sma and fast_sma < slow_sma:
            return Signal.SELL

        return Signal.HOLD


class CDCActionZoneStrategy:
    """
    CDC ActionZone V3 Strategy.

    Based on piriya33's TradingView indicator.

    Uses dual EMA (12/26) with colored zones based on:
    1. Trend direction (fast EMA vs slow EMA)
    2. Price position relative to EMAs

    Buy when entering Green zone.
    Sell when entering Red zone.

    Best for: Choppy markets, higher win rate but may miss some moves
    """

    name = "cdc-actionzone"
    description = "CDC ActionZone V3 - Filtered signals with zone confirmation"

    def __init__(self):
        self.fast_period = 12
        self.slow_period = 26

    def init(self, params: dict | None = None) -> None:
        if params:
            self.fast_period = params.get("fast_period", 12)
            self.slow_period = params.get("slow_period", 26)

    def calculate(self, candles: pl.DataFrame, index: int) -> Signal:
        if index < self.slow_period + 1:
            return Signal.HOLD

        price = candles["close"][index]
        prev_price = candles["close"][index - 1]

        fast_ema_val = ema(candles, self.fast_period, index)
        slow_ema_val = ema(candles, self.slow_period, index)
        prev_fast_ema = ema(candles, self.fast_period, index - 1)
        prev_slow_ema = ema(candles, self.slow_period, index - 1)

        if not all([fast_ema_val, slow_ema_val, prev_fast_ema, prev_slow_ema]):
            return Signal.HOLD

        current_zone = get_cdc_zone(price, fast_ema_val, slow_ema_val)
        prev_zone = get_cdc_zone(prev_price, prev_fast_ema, prev_slow_ema)

        # Entering Green zone = Buy
        if current_zone == CDCZone.GREEN and prev_zone != CDCZone.GREEN:
            return Signal.BUY

        # Entering Red zone = Sell
        if current_zone == CDCZone.RED and prev_zone != CDCZone.RED:
            return Signal.SELL

        return Signal.HOLD


class CDCConfirmedSMAStrategy:
    """
    CDC-Confirmed SMA Strategy.

    Hybrid combining SMA Crossover timing with CDC zone confirmation.

    BUY: SMA bullish crossover AND price in Green/Blue/Aqua zone
    SELL: SMA bearish crossover AND price in Red/Orange/Yellow zone

    Best for: Volatile assets (DOGE, meme coins) where false breakouts are common

    Backtest results:
    - BTC: Similar to SMA Crossover
    - DOGE: Outperforms SMA due to filter preventing whipsaws
    """

    name = "cdc-confirmed-sma"
    description = "CDC-Confirmed SMA - Best of both: SMA timing + CDC filter"

    def __init__(self):
        self.sma_fast = 10
        self.sma_slow = 20
        self.cdc_fast = 12
        self.cdc_slow = 26

    def init(self, params: dict | None = None) -> None:
        if params:
            self.sma_fast = params.get("sma_fast", 10)
            self.sma_slow = params.get("sma_slow", 20)
            self.cdc_fast = params.get("cdc_fast", 12)
            self.cdc_slow = params.get("cdc_slow", 26)

    def calculate(self, candles: pl.DataFrame, index: int) -> Signal:
        min_period = max(self.sma_slow, self.cdc_slow) + 1
        if index < min_period:
            return Signal.HOLD

        price = candles["close"][index]

        # SMA signals
        fast_sma_val = sma(candles, self.sma_fast, index)
        slow_sma_val = sma(candles, self.sma_slow, index)
        prev_fast_sma = sma(candles, self.sma_fast, index - 1)
        prev_slow_sma = sma(candles, self.sma_slow, index - 1)

        if not all([fast_sma_val, slow_sma_val, prev_fast_sma, prev_slow_sma]):
            return Signal.HOLD

        # CDC zone
        fast_ema_val = ema(candles, self.cdc_fast, index)
        slow_ema_val = ema(candles, self.cdc_slow, index)

        if not all([fast_ema_val, slow_ema_val]):
            return Signal.HOLD

        zone = get_cdc_zone(price, fast_ema_val, slow_ema_val)
        bullish_zones = [CDCZone.GREEN, CDCZone.BLUE, CDCZone.AQUA]
        bearish_zones = [CDCZone.RED, CDCZone.ORANGE, CDCZone.YELLOW]

        # SMA crossovers
        sma_bullish_cross = prev_fast_sma <= prev_slow_sma and fast_sma_val > slow_sma_val
        sma_bearish_cross = prev_fast_sma >= prev_slow_sma and fast_sma_val < slow_sma_val

        # Only enter if CDC zone confirms
        if sma_bullish_cross and zone in bullish_zones:
            return Signal.BUY

        if sma_bearish_cross and zone in bearish_zones:
            return Signal.SELL

        return Signal.HOLD


# Strategy registry
STRATEGIES = {
    "sma-crossover": SMACrossoverStrategy,
    "cdc-actionzone": CDCActionZoneStrategy,
    "cdc-confirmed-sma": CDCConfirmedSMAStrategy,
}


def get_strategy(name: str):
    """Get a strategy instance by name."""
    strategy_class = STRATEGIES.get(name)
    if strategy_class:
        return strategy_class()
    return None


def list_strategies() -> list[dict]:
    """List all available strategies."""
    return [
        {"name": s().name, "description": s().description}
        for s in STRATEGIES.values()
    ]
