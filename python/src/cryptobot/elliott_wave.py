"""Elliott Wave pattern detection.

Attempts to identify Elliott Wave patterns in price data:
- 5-wave impulse patterns (trend direction)
- 3-wave corrective patterns (counter-trend)
- Current wave position estimation
"""

import polars as pl
from dataclasses import dataclass
from enum import Enum
from typing import Literal


class WaveType(Enum):
    IMPULSE_UP = "impulse_up"      # 5-wave bullish
    IMPULSE_DOWN = "impulse_down"  # 5-wave bearish
    CORRECTIVE = "corrective"       # A-B-C correction
    UNKNOWN = "unknown"


class WavePosition(Enum):
    WAVE_1 = "wave_1"  # Initial impulse
    WAVE_2 = "wave_2"  # Retracement - SETUP ZONE
    WAVE_3 = "wave_3"  # Strongest move - BIG MONEY
    WAVE_4 = "wave_4"  # Consolidation
    WAVE_5 = "wave_5"  # Final push - watch for exhaustion
    WAVE_A = "wave_a"  # Correction start
    WAVE_B = "wave_b"  # Correction bounce
    WAVE_C = "wave_c"  # Correction end
    UNKNOWN = "unknown"


@dataclass
class SwingPoint:
    """A swing high or low point."""
    index: int
    price: float
    is_high: bool
    timestamp: int | None = None


@dataclass
class WaveCount:
    """Result of Elliott Wave analysis."""
    wave_type: WaveType
    current_position: WavePosition
    confidence: float  # 0-1 confidence in the count
    swing_points: list[SwingPoint]
    wave_3_target: float | None = None  # Projected Wave 3 target
    invalidation: float | None = None   # Price that invalidates count
    description: str = ""


def find_swing_points(
    candles: pl.DataFrame,
    lookback: int = 5,
    min_swing_percent: float = 2.0,
) -> list[SwingPoint]:
    """Find significant swing highs and lows.

    Args:
        candles: DataFrame with high, low, close columns
        lookback: Bars to look left/right for swing detection
        min_swing_percent: Minimum % move to qualify as swing

    Returns:
        List of SwingPoint objects
    """
    highs = candles["high"].to_list()
    lows = candles["low"].to_list()
    timestamps = candles["timestamp"].to_list() if "timestamp" in candles.columns else [None] * len(highs)

    swings: list[SwingPoint] = []
    n = len(highs)

    if n < lookback * 2 + 1:
        return swings

    for i in range(lookback, n - lookback):
        # Check for swing high
        is_swing_high = True
        for j in range(i - lookback, i + lookback + 1):
            if j != i and highs[j] >= highs[i]:
                is_swing_high = False
                break

        # Check for swing low
        is_swing_low = True
        for j in range(i - lookback, i + lookback + 1):
            if j != i and lows[j] <= lows[i]:
                is_swing_low = False
                break

        if is_swing_high:
            swings.append(SwingPoint(i, highs[i], True, timestamps[i]))
        elif is_swing_low:
            swings.append(SwingPoint(i, lows[i], False, timestamps[i]))

    # Filter out minor swings (less than min_swing_percent move)
    if len(swings) < 2:
        return swings

    filtered = [swings[0]]
    for swing in swings[1:]:
        last = filtered[-1]
        move_percent = abs(swing.price - last.price) / last.price * 100

        if move_percent >= min_swing_percent:
            # Only add if it's opposite type or larger move
            if swing.is_high != last.is_high:
                filtered.append(swing)
            elif move_percent > min_swing_percent * 1.5:
                # Same direction but bigger - replace
                filtered[-1] = swing

    return filtered


def detect_elliott_wave(
    candles: pl.DataFrame,
    lookback: int = 5,
    min_swing_percent: float = 3.0,
) -> WaveCount:
    """Detect Elliott Wave pattern and current position.

    Args:
        candles: OHLCV DataFrame
        lookback: Swing detection lookback period
        min_swing_percent: Minimum swing size

    Returns:
        WaveCount with analysis results
    """
    swings = find_swing_points(candles, lookback, min_swing_percent)

    if len(swings) < 3:
        return WaveCount(
            wave_type=WaveType.UNKNOWN,
            current_position=WavePosition.UNKNOWN,
            confidence=0.0,
            swing_points=swings,
            description="Insufficient swing points for wave count"
        )

    # Determine trend direction from recent swings
    recent_swings = swings[-6:] if len(swings) >= 6 else swings

    # Check if making higher highs and higher lows (uptrend)
    # or lower highs and lower lows (downtrend)
    highs = [s.price for s in recent_swings if s.is_high]
    lows = [s.price for s in recent_swings if not s.is_high]

    is_uptrend = False
    is_downtrend = False

    if len(highs) >= 2 and len(lows) >= 2:
        is_uptrend = highs[-1] > highs[0] and lows[-1] > lows[0]
        is_downtrend = highs[-1] < highs[0] and lows[-1] < lows[0]

    # Try to count waves
    wave_type = WaveType.UNKNOWN
    current_position = WavePosition.UNKNOWN
    confidence = 0.0
    wave_3_target = None
    invalidation = None
    description = ""

    if len(swings) >= 5:
        # Attempt 5-wave count
        result = _count_impulse_waves(swings, is_uptrend)
        if result:
            wave_type = result["wave_type"]
            current_position = result["position"]
            confidence = result["confidence"]
            wave_3_target = result.get("wave_3_target")
            invalidation = result.get("invalidation")
            description = result["description"]

    if wave_type == WaveType.UNKNOWN and len(swings) >= 3:
        # Try corrective count
        result = _count_corrective_waves(swings)
        if result:
            wave_type = WaveType.CORRECTIVE
            current_position = result["position"]
            confidence = result["confidence"]
            description = result["description"]

    return WaveCount(
        wave_type=wave_type,
        current_position=current_position,
        confidence=confidence,
        swing_points=swings,
        wave_3_target=wave_3_target,
        invalidation=invalidation,
        description=description,
    )


def _count_impulse_waves(
    swings: list[SwingPoint],
    is_uptrend: bool
) -> dict | None:
    """Attempt to count 5-wave impulse pattern."""

    if len(swings) < 5:
        return None

    # Take last 5-7 significant swings
    recent = swings[-7:] if len(swings) >= 7 else swings[-5:]

    # For uptrend: expect L-H-L-H-L-H-L pattern (lows at 0,2,4 highs at 1,3,5)
    # For downtrend: expect H-L-H-L-H-L-H pattern

    if is_uptrend:
        # Find potential wave structure
        lows = [s for s in recent if not s.is_high]
        highs = [s for s in recent if s.is_high]

        if len(lows) < 3 or len(highs) < 2:
            return None

        # Wave 1: first low to first high
        wave_1_start = lows[0].price
        wave_1_end = highs[0].price if highs[0].index > lows[0].index else None

        if wave_1_end is None:
            return None

        wave_1_size = wave_1_end - wave_1_start

        # Wave 2: pullback (should not exceed wave 1 start)
        wave_2_low = lows[1].price if len(lows) > 1 and lows[1].index > highs[0].index else None

        if wave_2_low is None:
            return None

        # Validate: Wave 2 should not go below Wave 1 start
        if wave_2_low < wave_1_start:
            return None

        wave_2_retrace = (wave_1_end - wave_2_low) / wave_1_size

        # Determine current position
        last_swing = recent[-1]
        current_price_idx = max(s.index for s in recent)

        # Check which wave we're likely in
        position = WavePosition.UNKNOWN
        confidence = 0.5
        wave_3_target = None
        invalidation = wave_1_start  # Wave 2 can't go below Wave 1 start

        if len(highs) >= 2 and len(lows) >= 2:
            wave_3_high = highs[1].price if len(highs) > 1 else None

            if wave_3_high and wave_3_high > wave_1_end:
                # Wave 3 in progress or complete
                wave_3_size = wave_3_high - wave_2_low

                if wave_3_size > wave_1_size * 1.618:
                    # Strong Wave 3, likely complete
                    if len(lows) >= 3 and lows[2].index > highs[1].index:
                        # Wave 4 pullback exists
                        wave_4_low = lows[2].price

                        if wave_4_low > wave_1_end:  # Wave 4 rule
                            if len(highs) >= 3 and highs[2].index > lows[2].index:
                                position = WavePosition.WAVE_5
                                confidence = 0.7
                            else:
                                position = WavePosition.WAVE_4
                                confidence = 0.65
                                invalidation = wave_1_end
                        else:
                            position = WavePosition.WAVE_4
                            confidence = 0.4  # Rule violation
                    else:
                        position = WavePosition.WAVE_3
                        confidence = 0.6
                else:
                    position = WavePosition.WAVE_3
                    confidence = 0.55
                    wave_3_target = wave_2_low + wave_1_size * 1.618
            else:
                # Still in Wave 2 or early Wave 3
                if wave_2_retrace >= 0.382 and wave_2_retrace <= 0.786:
                    position = WavePosition.WAVE_2
                    confidence = 0.6 + (0.2 if 0.5 <= wave_2_retrace <= 0.618 else 0)
                    wave_3_target = wave_2_low + wave_1_size * 1.618
                    invalidation = wave_1_start
                else:
                    position = WavePosition.WAVE_2
                    confidence = 0.4

        description = _get_wave_description(position, is_uptrend=True)

        return {
            "wave_type": WaveType.IMPULSE_UP,
            "position": position,
            "confidence": confidence,
            "wave_3_target": wave_3_target,
            "invalidation": invalidation,
            "description": description,
        }

    else:  # Downtrend - mirror logic
        highs = [s for s in recent if s.is_high]
        lows = [s for s in recent if not s.is_high]

        if len(highs) < 3 or len(lows) < 2:
            return None

        # Simplified for downtrend
        position = WavePosition.WAVE_3 if len(lows) >= 2 else WavePosition.WAVE_1
        confidence = 0.5

        return {
            "wave_type": WaveType.IMPULSE_DOWN,
            "position": position,
            "confidence": confidence,
            "description": _get_wave_description(position, is_uptrend=False),
        }


def _count_corrective_waves(swings: list[SwingPoint]) -> dict | None:
    """Attempt to count A-B-C corrective pattern."""

    if len(swings) < 3:
        return None

    recent = swings[-4:]

    # Simple A-B-C detection
    if len(recent) >= 3:
        # Check for zigzag pattern
        position = WavePosition.WAVE_C if len(recent) >= 4 else WavePosition.WAVE_B
        confidence = 0.4

        return {
            "position": position,
            "confidence": confidence,
            "description": f"Corrective pattern - currently in {position.value}",
        }

    return None


def _get_wave_description(position: WavePosition, is_uptrend: bool) -> str:
    """Get actionable description for wave position."""

    trend = "bullish" if is_uptrend else "bearish"

    descriptions = {
        WavePosition.WAVE_1: f"Wave 1 - Initial {trend} impulse. Wait for Wave 2 pullback.",
        WavePosition.WAVE_2: f"Wave 2 - Pullback/setup zone. PREPARE for Wave 3 entry.",
        WavePosition.WAVE_3: f"Wave 3 - Strongest move in progress. RIDE the trend.",
        WavePosition.WAVE_4: f"Wave 4 - Consolidation. Consider adding on pullback.",
        WavePosition.WAVE_5: f"Wave 5 - Final push. Watch for exhaustion/divergence.",
        WavePosition.WAVE_A: "Wave A - Correction starting. Reduce exposure.",
        WavePosition.WAVE_B: "Wave B - Counter-trend bounce. Don't chase.",
        WavePosition.WAVE_C: "Wave C - Correction ending. Watch for reversal setup.",
        WavePosition.UNKNOWN: "Wave structure unclear. Wait for clarity.",
    }

    return descriptions.get(position, "")
