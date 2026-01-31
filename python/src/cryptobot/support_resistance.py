"""Support and Resistance detection.

Identifies key price levels and zones (boxes) where price has historically
reacted. Used for:
- Entry/exit targets
- Stop loss placement
- Risk/reward calculation
"""

import polars as pl
from dataclasses import dataclass
from enum import Enum


class LevelType(Enum):
    SUPPORT = "support"
    RESISTANCE = "resistance"


@dataclass
class PriceLevel:
    """A support or resistance level."""
    price: float
    level_type: LevelType
    strength: int  # Number of touches
    first_touch_idx: int
    last_touch_idx: int


@dataclass
class PriceBox:
    """A support/resistance zone (box)."""
    top: float
    bottom: float
    level_type: LevelType
    strength: int
    description: str = ""

    @property
    def midpoint(self) -> float:
        return (self.top + self.bottom) / 2

    @property
    def height_percent(self) -> float:
        return (self.top - self.bottom) / self.bottom * 100


@dataclass
class SRAnalysis:
    """Support/Resistance analysis result."""
    levels: list[PriceLevel]
    boxes: list[PriceBox]
    nearest_support: PriceBox | None
    nearest_resistance: PriceBox | None
    current_price: float
    risk_reward_long: float | None  # R:R for long entry
    risk_reward_short: float | None  # R:R for short entry


def find_pivot_levels(
    candles: pl.DataFrame,
    lookback: int = 10,
    tolerance_percent: float = 0.5,
) -> list[PriceLevel]:
    """Find pivot-based support and resistance levels.

    Args:
        candles: OHLCV DataFrame
        lookback: Bars to look left/right for pivot detection
        tolerance_percent: Price tolerance for grouping touches

    Returns:
        List of PriceLevel objects sorted by strength
    """
    highs = candles["high"].to_list()
    lows = candles["low"].to_list()
    n = len(highs)

    if n < lookback * 2 + 1:
        return []

    pivot_highs: list[tuple[int, float]] = []
    pivot_lows: list[tuple[int, float]] = []

    # Find pivot highs and lows
    for i in range(lookback, n - lookback):
        # Pivot high
        is_pivot_high = all(
            highs[i] >= highs[j]
            for j in range(i - lookback, i + lookback + 1)
            if j != i
        )
        if is_pivot_high:
            pivot_highs.append((i, highs[i]))

        # Pivot low
        is_pivot_low = all(
            lows[i] <= lows[j]
            for j in range(i - lookback, i + lookback + 1)
            if j != i
        )
        if is_pivot_low:
            pivot_lows.append((i, lows[i]))

    # Group nearby pivots into levels
    levels: list[PriceLevel] = []

    # Process resistance levels (pivot highs)
    levels.extend(_cluster_pivots(pivot_highs, LevelType.RESISTANCE, tolerance_percent))

    # Process support levels (pivot lows)
    levels.extend(_cluster_pivots(pivot_lows, LevelType.SUPPORT, tolerance_percent))

    # Sort by strength (most touches first)
    levels.sort(key=lambda x: x.strength, reverse=True)

    return levels


def _cluster_pivots(
    pivots: list[tuple[int, float]],
    level_type: LevelType,
    tolerance_percent: float,
) -> list[PriceLevel]:
    """Cluster nearby pivot points into levels."""

    if not pivots:
        return []

    # Sort by price
    sorted_pivots = sorted(pivots, key=lambda x: x[1])

    levels: list[PriceLevel] = []
    used = set()

    for i, (idx, price) in enumerate(sorted_pivots):
        if i in used:
            continue

        # Find all pivots within tolerance
        cluster_indices = [i]
        cluster_prices = [price]
        cluster_idx_list = [idx]

        for j, (idx2, price2) in enumerate(sorted_pivots[i + 1 :], start=i + 1):
            if j in used:
                continue
            if abs(price2 - price) / price * 100 <= tolerance_percent:
                cluster_indices.append(j)
                cluster_prices.append(price2)
                cluster_idx_list.append(idx2)
                used.add(j)

        used.add(i)

        # Create level at average price
        avg_price = sum(cluster_prices) / len(cluster_prices)
        levels.append(PriceLevel(
            price=avg_price,
            level_type=level_type,
            strength=len(cluster_prices),
            first_touch_idx=min(cluster_idx_list),
            last_touch_idx=max(cluster_idx_list),
        ))

    return levels


def create_boxes(
    levels: list[PriceLevel],
    box_height_percent: float = 1.0,
) -> list[PriceBox]:
    """Convert price levels to boxes/zones.

    Args:
        levels: List of PriceLevel objects
        box_height_percent: Height of box as % of price

    Returns:
        List of PriceBox objects
    """
    boxes: list[PriceBox] = []

    for level in levels:
        half_height = level.price * (box_height_percent / 100) / 2

        boxes.append(PriceBox(
            top=level.price + half_height,
            bottom=level.price - half_height,
            level_type=level.level_type,
            strength=level.strength,
            description=f"{level.level_type.value.title()} zone ({level.strength} touches)",
        ))

    return boxes


def analyze_support_resistance(
    candles: pl.DataFrame,
    lookback: int = 10,
    tolerance_percent: float = 0.5,
    box_height_percent: float = 1.0,
    max_levels: int = 10,
) -> SRAnalysis:
    """Complete support/resistance analysis.

    Args:
        candles: OHLCV DataFrame
        lookback: Pivot detection lookback
        tolerance_percent: Price clustering tolerance
        box_height_percent: Box zone height
        max_levels: Maximum levels to return

    Returns:
        SRAnalysis with levels, boxes, and risk/reward
    """
    current_price = candles["close"][-1]

    # Find levels
    levels = find_pivot_levels(candles, lookback, tolerance_percent)
    levels = levels[:max_levels]  # Limit to strongest

    # Create boxes
    boxes = create_boxes(levels, box_height_percent)

    # Find nearest support and resistance
    supports = [b for b in boxes if b.level_type == LevelType.SUPPORT and b.top < current_price]
    resistances = [b for b in boxes if b.level_type == LevelType.RESISTANCE and b.bottom > current_price]

    nearest_support = max(supports, key=lambda b: b.top) if supports else None
    nearest_resistance = min(resistances, key=lambda b: b.bottom) if resistances else None

    # Calculate risk/reward
    risk_reward_long = None
    risk_reward_short = None

    if nearest_support and nearest_resistance:
        # Long R:R: reward = distance to resistance, risk = distance to support
        reward_long = nearest_resistance.midpoint - current_price
        risk_long = current_price - nearest_support.midpoint

        if risk_long > 0:
            risk_reward_long = reward_long / risk_long

        # Short R:R: reward = distance to support, risk = distance to resistance
        reward_short = current_price - nearest_support.midpoint
        risk_short = nearest_resistance.midpoint - current_price

        if risk_short > 0:
            risk_reward_short = reward_short / risk_short

    return SRAnalysis(
        levels=levels,
        boxes=boxes,
        nearest_support=nearest_support,
        nearest_resistance=nearest_resistance,
        current_price=current_price,
        risk_reward_long=risk_reward_long,
        risk_reward_short=risk_reward_short,
    )
