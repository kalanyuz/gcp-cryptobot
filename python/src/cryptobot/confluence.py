"""Confluence Analyzer - Decision support combining multiple analysis methods.

Combines:
- Elliott Wave position
- Support/Resistance levels
- Bollinger/Keltner bands
- Strategy signals (SMA, CDC)

To provide a comprehensive view of market conditions and signal quality.
"""

import polars as pl
from dataclasses import dataclass
from enum import Enum

from .elliott_wave import WaveCount, WavePosition, detect_elliott_wave
from .support_resistance import SRAnalysis, analyze_support_resistance
from .indicators import BandAnalysis, analyze_bands
from .strategies import get_strategy
from .entities import Signal


class ConfluenceLevel(Enum):
    STRONG_BUY = "strong_buy"
    BUY = "buy"
    NEUTRAL = "neutral"
    SELL = "sell"
    STRONG_SELL = "strong_sell"


@dataclass
class SignalComponent:
    """Individual signal component with weight."""
    name: str
    signal: str  # "bullish", "bearish", "neutral"
    weight: float  # 0-1
    description: str


@dataclass
class ConfluenceResult:
    """Complete confluence analysis result."""
    # Individual analyses
    wave: WaveCount
    support_resistance: SRAnalysis
    bands: BandAnalysis
    strategy_signals: dict[str, Signal]

    # Confluence scoring
    components: list[SignalComponent]
    bullish_score: float  # 0-1
    bearish_score: float  # 0-1
    confluence_level: ConfluenceLevel

    # Actionable info
    current_price: float
    suggested_entry: float | None
    suggested_stop: float | None
    suggested_target: float | None
    risk_reward: float | None

    # Summary
    summary: str


def analyze_confluence(
    candles: pl.DataFrame,
    strategies: list[str] | None = None,
) -> ConfluenceResult:
    """
    Run complete confluence analysis.

    Args:
        candles: OHLCV DataFrame (needs 50+ candles for good analysis)
        strategies: Strategy names to include (default: all 3)

    Returns:
        ConfluenceResult with comprehensive analysis
    """
    if strategies is None:
        strategies = ["sma-crossover", "cdc-actionzone", "cdc-confirmed-sma"]

    current_idx = len(candles) - 1
    current_price = candles["close"][current_idx]

    # Run individual analyses
    wave = detect_elliott_wave(candles)
    sr = analyze_support_resistance(candles)
    bands = analyze_bands(candles, current_idx)

    # Get strategy signals
    strategy_signals = {}
    for name in strategies:
        strat = get_strategy(name)
        if strat:
            strategy_signals[name] = strat.calculate(candles, current_idx)

    # Build signal components
    components: list[SignalComponent] = []

    # Elliott Wave component
    wave_signal, wave_desc = _evaluate_wave(wave)
    components.append(SignalComponent(
        name="Elliott Wave",
        signal=wave_signal,
        weight=0.2,
        description=wave_desc,
    ))

    # Support/Resistance component
    sr_signal, sr_desc = _evaluate_sr(sr, current_price)
    components.append(SignalComponent(
        name="Support/Resistance",
        signal=sr_signal,
        weight=0.2,
        description=sr_desc,
    ))

    # Bands component
    band_signal, band_desc = _evaluate_bands(bands)
    components.append(SignalComponent(
        name="Bollinger Bands",
        signal=band_signal,
        weight=0.15,
        description=band_desc,
    ))

    # Strategy components
    strategy_weight = 0.45 / len(strategies) if strategies else 0
    for name, sig in strategy_signals.items():
        if sig == Signal.BUY:
            strat_signal = "bullish"
        elif sig == Signal.SELL:
            strat_signal = "bearish"
        else:
            strat_signal = "neutral"

        components.append(SignalComponent(
            name=f"Strategy: {name}",
            signal=strat_signal,
            weight=strategy_weight,
            description=f"{name} signal: {sig.value}",
        ))

    # Calculate confluence scores
    bullish_score = sum(
        c.weight for c in components if c.signal == "bullish"
    )
    bearish_score = sum(
        c.weight for c in components if c.signal == "bearish"
    )

    # Determine confluence level
    if bullish_score >= 0.7:
        confluence_level = ConfluenceLevel.STRONG_BUY
    elif bullish_score >= 0.5:
        confluence_level = ConfluenceLevel.BUY
    elif bearish_score >= 0.7:
        confluence_level = ConfluenceLevel.STRONG_SELL
    elif bearish_score >= 0.5:
        confluence_level = ConfluenceLevel.SELL
    else:
        confluence_level = ConfluenceLevel.NEUTRAL

    # Calculate entry/stop/target
    suggested_entry = None
    suggested_stop = None
    suggested_target = None
    risk_reward = None

    if confluence_level in (ConfluenceLevel.STRONG_BUY, ConfluenceLevel.BUY):
        suggested_entry = current_price
        if sr.nearest_support:
            suggested_stop = sr.nearest_support.bottom * 0.99  # 1% below support
        if sr.nearest_resistance:
            suggested_target = sr.nearest_resistance.top
        elif wave.wave_3_target:
            suggested_target = wave.wave_3_target

    elif confluence_level in (ConfluenceLevel.STRONG_SELL, ConfluenceLevel.SELL):
        suggested_entry = current_price
        if sr.nearest_resistance:
            suggested_stop = sr.nearest_resistance.top * 1.01  # 1% above resistance
        if sr.nearest_support:
            suggested_target = sr.nearest_support.bottom

    # Calculate risk/reward
    if suggested_entry and suggested_stop and suggested_target:
        risk = abs(suggested_entry - suggested_stop)
        reward = abs(suggested_target - suggested_entry)
        risk_reward = reward / risk if risk > 0 else None

    # Generate summary
    summary = _generate_summary(
        confluence_level, components, wave, sr, bands, risk_reward
    )

    return ConfluenceResult(
        wave=wave,
        support_resistance=sr,
        bands=bands,
        strategy_signals=strategy_signals,
        components=components,
        bullish_score=bullish_score,
        bearish_score=bearish_score,
        confluence_level=confluence_level,
        current_price=current_price,
        suggested_entry=suggested_entry,
        suggested_stop=suggested_stop,
        suggested_target=suggested_target,
        risk_reward=risk_reward,
        summary=summary,
    )


def _evaluate_wave(wave: WaveCount) -> tuple[str, str]:
    """Evaluate Elliott Wave for confluence."""

    bullish_positions = {
        WavePosition.WAVE_2,  # Setup for Wave 3
        WavePosition.WAVE_4,  # Continuation
        WavePosition.WAVE_C,  # Correction ending
    }

    bearish_positions = {
        WavePosition.WAVE_5,  # Exhaustion
        WavePosition.WAVE_A,  # Correction starting
    }

    if wave.current_position in bullish_positions:
        if wave.confidence >= 0.6:
            return "bullish", wave.description
        return "neutral", f"{wave.description} (low confidence)"

    if wave.current_position in bearish_positions:
        if wave.confidence >= 0.6:
            return "bearish", wave.description
        return "neutral", f"{wave.description} (low confidence)"

    return "neutral", wave.description or "Wave position unclear"


def _evaluate_sr(sr: SRAnalysis, current_price: float) -> tuple[str, str]:
    """Evaluate Support/Resistance for confluence."""

    if sr.nearest_support and sr.nearest_resistance:
        dist_to_support = (current_price - sr.nearest_support.top) / current_price
        dist_to_resistance = (sr.nearest_resistance.bottom - current_price) / current_price

        # Near support = bullish, near resistance = bearish
        if dist_to_support < 0.02:  # Within 2% of support
            return "bullish", f"Near support zone @ ${sr.nearest_support.midpoint:,.0f}"
        if dist_to_resistance < 0.02:  # Within 2% of resistance
            return "bearish", f"Near resistance zone @ ${sr.nearest_resistance.midpoint:,.0f}"

        # Check R:R
        if sr.risk_reward_long and sr.risk_reward_long >= 2.0:
            return "bullish", f"Favorable R:R for long ({sr.risk_reward_long:.1f}:1)"
        if sr.risk_reward_short and sr.risk_reward_short >= 2.0:
            return "bearish", f"Favorable R:R for short ({sr.risk_reward_short:.1f}:1)"

    return "neutral", "No clear S/R setup"


def _evaluate_bands(bands: BandAnalysis) -> tuple[str, str]:
    """Evaluate Bollinger Bands for confluence."""

    if bands.position == "oversold":
        return "bullish", bands.description
    if bands.position == "overbought":
        return "bearish", bands.description
    return "neutral", bands.description


def _generate_summary(
    level: ConfluenceLevel,
    components: list[SignalComponent],
    wave: WaveCount,
    sr: SRAnalysis,
    bands: BandAnalysis,
    risk_reward: float | None,
) -> str:
    """Generate human-readable summary."""

    lines = []

    # Overall assessment
    level_text = {
        ConfluenceLevel.STRONG_BUY: "STRONG BUY - Multiple bullish signals aligned",
        ConfluenceLevel.BUY: "BUY - Bullish bias with some confirmation",
        ConfluenceLevel.NEUTRAL: "NEUTRAL - Mixed signals, wait for clarity",
        ConfluenceLevel.SELL: "SELL - Bearish bias with some confirmation",
        ConfluenceLevel.STRONG_SELL: "STRONG SELL - Multiple bearish signals aligned",
    }
    lines.append(f"CONFLUENCE: {level_text[level]}")
    lines.append("")

    # Component breakdown
    bullish = [c for c in components if c.signal == "bullish"]
    bearish = [c for c in components if c.signal == "bearish"]

    if bullish:
        lines.append("Bullish factors:")
        for c in bullish:
            lines.append(f"  + {c.name}: {c.description}")

    if bearish:
        lines.append("Bearish factors:")
        for c in bearish:
            lines.append(f"  - {c.name}: {c.description}")

    # Risk/Reward
    if risk_reward:
        lines.append("")
        rr_quality = "excellent" if risk_reward >= 3 else "good" if risk_reward >= 2 else "acceptable" if risk_reward >= 1 else "poor"
        lines.append(f"Risk/Reward: {risk_reward:.2f}:1 ({rr_quality})")

    # Wave context
    if wave.current_position != WavePosition.UNKNOWN:
        lines.append("")
        lines.append(f"Elliott Wave: {wave.description}")

    # Squeeze alert
    if bands.squeeze:
        lines.append("")
        lines.append("⚠ VOLATILITY SQUEEZE - Expect breakout soon!")

    return "\n".join(lines)


def print_confluence_report(result: ConfluenceResult):
    """Print formatted confluence report."""

    print("=" * 70)
    print("                    CONFLUENCE ANALYSIS REPORT")
    print("=" * 70)
    print()
    print(f"  Current Price: ${result.current_price:,.2f}")
    print()

    # Signal components
    print("  SIGNAL COMPONENTS:")
    print("  " + "-" * 66)
    for c in result.components:
        icon = "✓" if c.signal == "bullish" else "✗" if c.signal == "bearish" else "○"
        signal_str = c.signal.upper().ljust(8)
        print(f"  {icon} {c.name.ljust(25)} │ {signal_str} │ {c.description[:30]}")
    print("  " + "-" * 66)
    print()

    # Scores
    print(f"  Bullish Score: {result.bullish_score:.0%}")
    print(f"  Bearish Score: {result.bearish_score:.0%}")
    print()

    # Trade setup
    if result.suggested_entry:
        print("  SUGGESTED TRADE SETUP:")
        print("  " + "-" * 66)
        print(f"  Entry:  ${result.suggested_entry:,.2f}")
        if result.suggested_stop:
            print(f"  Stop:   ${result.suggested_stop:,.2f}")
        if result.suggested_target:
            print(f"  Target: ${result.suggested_target:,.2f}")
        if result.risk_reward:
            print(f"  R:R:    {result.risk_reward:.2f}:1")
        print()

    # Summary
    print("  " + "-" * 66)
    for line in result.summary.split("\n"):
        print(f"  {line}")
    print("=" * 70)
