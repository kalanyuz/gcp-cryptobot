"""
Technical indicators using polars for efficient computation.
"""

import polars as pl
import math


def sma(candles: pl.DataFrame, period: int, index: int) -> float | None:
    """
    Simple Moving Average.

    Args:
        candles: DataFrame with 'close' column
        period: Number of periods
        index: Current index

    Returns:
        SMA value or None if insufficient data
    """
    if index < period - 1:
        return None

    start = index - period + 1
    closes = candles["close"][start : index + 1].to_list()
    return sum(closes) / period


def ema(candles: pl.DataFrame, period: int, index: int) -> float | None:
    """
    Exponential Moving Average.

    Uses the standard EMA formula: EMA = price * k + EMA_prev * (1 - k)
    where k = 2 / (period + 1)

    Args:
        candles: DataFrame with 'close' column
        period: Number of periods
        index: Current index

    Returns:
        EMA value or None if insufficient data
    """
    if index < period - 1:
        return None

    closes = candles["close"][: index + 1].to_list()
    multiplier = 2 / (period + 1)

    # Start with SMA for first EMA value
    ema_value = sum(closes[:period]) / period

    # Calculate EMA for remaining values
    for i in range(period, index + 1):
        ema_value = closes[i] * multiplier + ema_value * (1 - multiplier)

    return ema_value


def atr(candles: pl.DataFrame, period: int, index: int) -> float | None:
    """
    Average True Range.

    Args:
        candles: DataFrame with high, low, close columns
        period: Number of periods
        index: Current index

    Returns:
        ATR value or None if insufficient data
    """
    if index < period:
        return None

    true_ranges = []
    for i in range(index - period + 1, index + 1):
        high = candles["high"][i]
        low = candles["low"][i]
        prev_close = candles["close"][i - 1] if i > 0 else candles["close"][i]

        tr = max(
            high - low,
            abs(high - prev_close),
            abs(low - prev_close),
        )
        true_ranges.append(tr)

    return sum(true_ranges) / period


def rsi(candles: pl.DataFrame, period: int, index: int) -> float | None:
    """
    Relative Strength Index.

    Args:
        candles: DataFrame with 'close' column
        period: Number of periods (typically 14)
        index: Current index

    Returns:
        RSI value (0-100) or None if insufficient data
    """
    if index < period:
        return None

    gains = []
    losses = []

    for i in range(index - period + 1, index + 1):
        change = candles["close"][i] - candles["close"][i - 1]
        if change > 0:
            gains.append(change)
            losses.append(0)
        else:
            gains.append(0)
            losses.append(abs(change))

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


# Vectorized versions for batch processing (more efficient for full backtest)


def sma_series(closes: pl.Series, period: int) -> pl.Series:
    """Vectorized SMA calculation."""
    return closes.rolling_mean(window_size=period)


def ema_series(closes: pl.Series, period: int) -> pl.Series:
    """Vectorized EMA calculation."""
    return closes.ewm_mean(span=period, adjust=False)


def atr_series(df: pl.DataFrame, period: int) -> pl.Series:
    """Vectorized ATR calculation."""
    high = df["high"]
    low = df["low"]
    close = df["close"]
    prev_close = close.shift(1)

    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()

    # Element-wise max
    true_range = pl.max_horizontal(tr1, tr2, tr3)

    return true_range.rolling_mean(window_size=period)


# Band indicators for confluence analysis


from dataclasses import dataclass


@dataclass
class BollingerBands:
    """Bollinger Bands values."""
    upper: float
    middle: float
    lower: float
    width: float  # Band width as % of middle
    percent_b: float  # %B - where price is relative to bands (0=lower, 1=upper)


@dataclass
class KeltnerChannels:
    """Keltner Channel values."""
    upper: float
    middle: float
    lower: float


def bollinger_bands(
    candles: pl.DataFrame,
    index: int,
    period: int = 20,
    std_dev: float = 2.0,
) -> BollingerBands | None:
    """
    Calculate Bollinger Bands.

    Args:
        candles: DataFrame with 'close' column
        index: Current index
        period: SMA period (default 20)
        std_dev: Standard deviation multiplier (default 2.0)

    Returns:
        BollingerBands or None if insufficient data
    """
    if index < period - 1:
        return None

    closes = candles["close"][index - period + 1 : index + 1].to_list()
    current_price = candles["close"][index]

    # Middle band (SMA)
    middle = sum(closes) / period

    # Standard deviation
    variance = sum((x - middle) ** 2 for x in closes) / period
    std = variance ** 0.5

    # Upper and lower bands
    upper = middle + std_dev * std
    lower = middle - std_dev * std

    # Band width
    width = (upper - lower) / middle * 100 if middle > 0 else 0

    # %B - position within bands
    band_range = upper - lower
    percent_b = (current_price - lower) / band_range if band_range > 0 else 0.5

    return BollingerBands(
        upper=upper,
        middle=middle,
        lower=lower,
        width=width,
        percent_b=percent_b,
    )


def keltner_channels(
    candles: pl.DataFrame,
    index: int,
    ema_period: int = 20,
    atr_period: int = 10,
    multiplier: float = 2.0,
) -> KeltnerChannels | None:
    """
    Calculate Keltner Channels.

    Args:
        candles: DataFrame with OHLC columns
        index: Current index
        ema_period: EMA period for middle line (default 20)
        atr_period: ATR period (default 10)
        multiplier: ATR multiplier for bands (default 2.0)

    Returns:
        KeltnerChannels or None if insufficient data
    """
    middle = ema(candles, ema_period, index)
    atr_val = atr(candles, atr_period, index)

    if middle is None or atr_val is None:
        return None

    upper = middle + multiplier * atr_val
    lower = middle - multiplier * atr_val

    return KeltnerChannels(
        upper=upper,
        middle=middle,
        lower=lower,
    )


@dataclass
class BandAnalysis:
    """Combined band analysis result."""
    bollinger: BollingerBands | None
    keltner: KeltnerChannels | None
    squeeze: bool  # Bollinger inside Keltner (low volatility)
    position: str  # "oversold", "neutral", "overbought"
    description: str


def analyze_bands(
    candles: pl.DataFrame,
    index: int,
) -> BandAnalysis:
    """
    Analyze price position relative to bands.

    Returns:
        BandAnalysis with squeeze detection and position assessment
    """
    bb = bollinger_bands(candles, index)
    kc = keltner_channels(candles, index)

    current_price = candles["close"][index]

    # Detect squeeze (Bollinger inside Keltner = low volatility, expect breakout)
    squeeze = False
    if bb and kc:
        squeeze = bb.lower > kc.lower and bb.upper < kc.upper

    # Determine position
    position = "neutral"
    description = ""

    if bb:
        if bb.percent_b <= 0.0:
            position = "oversold"
            description = "Price at/below lower band - oversold"
        elif bb.percent_b >= 1.0:
            position = "overbought"
            description = "Price at/above upper band - overbought"
        elif bb.percent_b <= 0.2:
            position = "oversold"
            description = "Price near lower band - potentially oversold"
        elif bb.percent_b >= 0.8:
            position = "overbought"
            description = "Price near upper band - potentially overbought"
        else:
            position = "neutral"
            description = "Price within bands - neutral"

        if squeeze:
            description += " | SQUEEZE detected (expect volatility expansion)"

    return BandAnalysis(
        bollinger=bb,
        keltner=kc,
        squeeze=squeeze,
        position=position,
        description=description,
    )
