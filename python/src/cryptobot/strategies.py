"""
Trading strategies.

Available strategies:
1. SMA Crossover - Best for clean trending markets (BTC)
2. CDC ActionZone - Filtered signals with zone confirmation
3. CDC-Confirmed SMA - Hybrid best for volatile assets (DOGE)
4. Elliott Wave - Entry at Wave 2/C setups, exit at Wave 5
5. Confluence - Multi-factor confirmation (S/R + Bands + Indicators)
"""

from enum import Enum
import polars as pl
from .entities import Signal
from .indicators import sma, ema, bollinger_bands


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


class ElliottWaveStrategy:
    """
    Elliott Wave Strategy.

    Uses swing point detection to identify wave patterns:
    - BUY: Wave 2 retracement (setup for Wave 3) or Wave 4 pullback
    - SELL: Wave 5 exhaustion or entering correction

    Also uses simple wave structure (higher highs/lows vs lower highs/lows)
    when formal wave count is unavailable.

    Best for: Trend following with wave-based timing
    """

    name = "elliott-wave"
    description = "Elliott Wave - Entry at Wave 2/4, exit at Wave 5"

    def __init__(self):
        self.lookback = 3  # More sensitive swing detection
        self.min_swing_percent = 2.0  # Smaller swings count
        self.trend_period = 50

    def init(self, params: dict | None = None) -> None:
        if params:
            self.lookback = params.get("lookback", 3)
            self.min_swing_percent = params.get("min_swing_percent", 2.0)
            self.trend_period = params.get("trend_period", 50)

    def calculate(self, candles: pl.DataFrame, index: int) -> Signal:
        # Need enough data for wave analysis
        if index < self.trend_period:
            return Signal.HOLD

        # Import here to avoid circular import
        from .elliott_wave import detect_elliott_wave, WavePosition, find_swing_points

        # Analyze up to current index
        candle_slice = candles[:index + 1]
        wave = detect_elliott_wave(candle_slice, self.lookback, self.min_swing_percent)

        # If we have a confident wave count, use it
        if wave.confidence >= 0.4:
            # Buy setups: Wave 2 or Wave 4 (pullbacks in uptrend)
            if wave.current_position in (WavePosition.WAVE_2, WavePosition.WAVE_4, WavePosition.WAVE_C):
                return Signal.BUY

            # Sell setups: Wave 5 (exhaustion) or Wave A (correction starting)
            if wave.current_position in (WavePosition.WAVE_5, WavePosition.WAVE_A):
                return Signal.SELL

        # Fallback: Use simple swing structure
        swings = find_swing_points(candle_slice, self.lookback, self.min_swing_percent)

        if len(swings) >= 4:
            recent = swings[-4:]
            highs = [s.price for s in recent if s.is_high]
            lows = [s.price for s in recent if not s.is_high]

            price = candles["close"][index]

            if len(highs) >= 2 and len(lows) >= 2:
                # Uptrend: Higher highs and higher lows
                uptrend = highs[-1] > highs[0] and lows[-1] > lows[0]
                # Downtrend: Lower highs and lower lows
                downtrend = highs[-1] < highs[0] and lows[-1] < lows[0]

                # Buy on pullback in uptrend (price near recent low)
                if uptrend and len(lows) >= 1:
                    recent_low = lows[-1]
                    if price < recent_low * 1.03:  # Within 3% of recent low
                        return Signal.BUY

                # Sell on rally in downtrend (price near recent high)
                if downtrend and len(highs) >= 1:
                    recent_high = highs[-1]
                    if price > recent_high * 0.97:  # Within 3% of recent high
                        return Signal.SELL

        return Signal.HOLD


class ConfluenceStrategy:
    """
    Confluence Strategy.

    Combines multiple confirmations for entries:
    - Bollinger Band breakout after squeeze
    - EMA trend alignment
    - Price momentum confirmation

    BUY: Band expansion upward + uptrend + momentum
    SELL: Band expansion downward + downtrend + momentum

    Best for: Catching breakouts with multiple confirmations
    """

    name = "confluence"
    description = "Confluence - Band breakout + Trend + Momentum"

    def __init__(self):
        self.ema_period = 21
        self.bb_period = 20
        self.momentum_period = 10

    def init(self, params: dict | None = None) -> None:
        if params:
            self.ema_period = params.get("ema_period", 21)
            self.bb_period = params.get("bb_period", 20)
            self.momentum_period = params.get("momentum_period", 10)

    def calculate(self, candles: pl.DataFrame, index: int) -> Signal:
        min_period = max(self.ema_period, self.bb_period, self.momentum_period) + 5
        if index < min_period:
            return Signal.HOLD

        price = candles["close"][index]
        prev_price = candles["close"][index - 1]

        # 1. EMA trend
        ema_val = ema(candles, self.ema_period, index)
        prev_ema = ema(candles, self.ema_period, index - 1)

        if ema_val is None or prev_ema is None:
            return Signal.HOLD

        uptrend = price > ema_val and ema_val > prev_ema
        downtrend = price < ema_val and ema_val < prev_ema

        # 2. Bollinger Bands
        bb = bollinger_bands(candles, index, self.bb_period)
        prev_bb = bollinger_bands(candles, index - 1, self.bb_period)

        if bb is None or prev_bb is None:
            return Signal.HOLD

        # Band expansion (coming out of squeeze)
        band_expanding = bb.width > prev_bb.width

        # 3. Momentum (price change over period)
        momentum_start = candles["close"][index - self.momentum_period]
        momentum = (price - momentum_start) / momentum_start

        bullish_momentum = momentum > 0.02  # 2% gain
        bearish_momentum = momentum < -0.02  # 2% loss

        # 4. Confluence signals
        # BUY: Uptrend + band expanding upward + bullish momentum + price above upper band
        if uptrend and band_expanding and bullish_momentum and bb.percent_b > 0.8:
            return Signal.BUY

        # SELL: Downtrend + band expanding downward + bearish momentum + price below lower band
        if downtrend and band_expanding and bearish_momentum and bb.percent_b < 0.2:
            return Signal.SELL

        # Alternative: Strong breakout signal (price closing outside bands with volume confirmation)
        # Breakout above upper band in uptrend
        if uptrend and price > bb.upper and prev_price < prev_bb.upper:
            return Signal.BUY

        # Breakdown below lower band in downtrend
        if downtrend and price < bb.lower and prev_price > prev_bb.lower:
            return Signal.SELL

        return Signal.HOLD


# Strategy registry
STRATEGIES = {
    "sma-crossover": SMACrossoverStrategy,
    "cdc-actionzone": CDCActionZoneStrategy,
    "cdc-confirmed-sma": CDCConfirmedSMAStrategy,
    "elliott-wave": ElliottWaveStrategy,
    "confluence": ConfluenceStrategy,
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
