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
