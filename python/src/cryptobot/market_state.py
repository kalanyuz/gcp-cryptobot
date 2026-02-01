"""Market State Generator - Produces structured JSON for Claude Code.

Outputs comprehensive market analysis that Claude can use to make trading decisions.
"""

import json
from datetime import datetime, timezone
from dataclasses import dataclass, asdict
import polars as pl

from .exchange import ExchangeClient
from .indicators import sma, ema, rsi, atr, bollinger_bands, keltner_channels
from .elliott_wave import detect_elliott_wave
from .support_resistance import analyze_support_resistance
from .confluence import analyze_confluence, ConfluenceLevel
from .strategies import get_strategy, list_strategies
from .database import TradingDatabase, Position


@dataclass
class MarketState:
    """Complete market state for Claude's decision making."""

    # Meta
    timestamp: str
    symbol: str
    timeframe: str

    # Price data
    current_price: float
    price_change_24h: float
    price_change_7d: float

    # Indicators
    sma_10: float | None
    sma_20: float | None
    sma_50: float | None
    ema_12: float | None
    ema_26: float | None
    rsi_14: float | None
    atr_14: float | None

    # Bollinger Bands
    bb_upper: float | None
    bb_middle: float | None
    bb_lower: float | None
    bb_percent_b: float | None
    bb_width: float | None

    # Keltner Channels
    kc_upper: float | None
    kc_middle: float | None
    kc_lower: float | None
    squeeze_detected: bool

    # Elliott Wave
    wave_position: str
    wave_confidence: float
    wave_description: str
    wave_3_target: float | None
    wave_invalidation: float | None

    # Support/Resistance
    nearest_support: float | None
    nearest_resistance: float | None
    support_strength: int
    resistance_strength: int
    risk_reward_long: float | None
    risk_reward_short: float | None

    # Strategy signals
    strategy_signals: dict[str, str]

    # Confluence
    confluence_level: str
    bullish_score: float
    bearish_score: float
    confluence_summary: str

    # Position (if any)
    has_position: bool
    position_side: str | None
    position_entry_price: float | None
    position_quantity: float | None
    position_pnl_percent: float | None
    position_stop_loss: float | None
    position_take_profit: float | None

    # Portfolio
    available_balance: float
    total_balance: float

    # Recent history
    recent_decisions: list[dict]

    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(asdict(self), indent=2)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return asdict(self)


def generate_market_state(
    symbol: str = "BTC/USDT",
    timeframe: str = "1d",
    db_path: str = "trading.db",
    exchange_id: str = "binance",
    api_key: str | None = None,
    api_secret: str | None = None,
) -> MarketState:
    """
    Generate complete market state for Claude's analysis.

    Args:
        symbol: Trading pair
        timeframe: Candle timeframe
        db_path: Path to SQLite database
        exchange_id: Exchange to use
        api_key: API key (optional for public data)
        api_secret: API secret

    Returns:
        MarketState with all analysis data
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    # Initialize clients
    exchange = ExchangeClient(exchange_id, api_key, api_secret, testnet=False)
    db = TradingDatabase(db_path)

    # Fetch candles
    candles = exchange.fetch_candles(symbol, timeframe, limit=100)
    current_idx = len(candles) - 1
    current_price = candles["close"][current_idx]

    # Price changes
    price_24h_ago = candles["close"][current_idx - 1] if current_idx > 0 else current_price
    price_7d_ago = candles["close"][current_idx - 7] if current_idx >= 7 else current_price
    price_change_24h = (current_price - price_24h_ago) / price_24h_ago * 100
    price_change_7d = (current_price - price_7d_ago) / price_7d_ago * 100

    # Calculate indicators
    sma_10 = sma(candles, 10, current_idx)
    sma_20 = sma(candles, 20, current_idx)
    sma_50 = sma(candles, 50, current_idx)
    ema_12 = ema(candles, 12, current_idx)
    ema_26 = ema(candles, 26, current_idx)
    rsi_14 = rsi(candles, 14, current_idx)
    atr_14 = atr(candles, 14, current_idx)

    # Bollinger Bands
    bb = bollinger_bands(candles, current_idx)
    bb_upper = bb.upper if bb else None
    bb_middle = bb.middle if bb else None
    bb_lower = bb.lower if bb else None
    bb_percent_b = bb.percent_b if bb else None
    bb_width = bb.width if bb else None

    # Keltner Channels
    kc = keltner_channels(candles, current_idx)
    kc_upper = kc.upper if kc else None
    kc_middle = kc.middle if kc else None
    kc_lower = kc.lower if kc else None

    # Squeeze detection
    squeeze_detected = False
    if bb and kc:
        squeeze_detected = bb.lower > kc.lower and bb.upper < kc.upper

    # Elliott Wave
    wave = detect_elliott_wave(candles)
    wave_position = wave.current_position.value
    wave_confidence = wave.confidence
    wave_description = wave.description
    wave_3_target = wave.wave_3_target
    wave_invalidation = wave.invalidation

    # Support/Resistance
    sr = analyze_support_resistance(candles)
    nearest_support = sr.nearest_support.midpoint if sr.nearest_support else None
    nearest_resistance = sr.nearest_resistance.midpoint if sr.nearest_resistance else None
    support_strength = sr.nearest_support.strength if sr.nearest_support else 0
    resistance_strength = sr.nearest_resistance.strength if sr.nearest_resistance else 0
    risk_reward_long = sr.risk_reward_long
    risk_reward_short = sr.risk_reward_short

    # Strategy signals
    strategy_signals = {}
    for strat_info in list_strategies():
        strat = get_strategy(strat_info["name"])
        if strat:
            signal = strat.calculate(candles, current_idx)
            strategy_signals[strat_info["name"]] = signal.value

    # Confluence analysis
    confluence = analyze_confluence(candles)
    confluence_level = confluence.confluence_level.value
    bullish_score = confluence.bullish_score
    bearish_score = confluence.bearish_score
    confluence_summary = confluence.summary

    # Current position
    position = db.get_position_by_symbol(symbol)
    has_position = position is not None
    position_side = position.side if position else None
    position_entry_price = position.entry_price if position else None
    position_quantity = position.quantity if position else None
    position_stop_loss = position.stop_loss if position else None
    position_take_profit = position.take_profit if position else None

    position_pnl_percent = None
    if position and position.entry_price:
        if position.side == "long":
            position_pnl_percent = (current_price - position.entry_price) / position.entry_price * 100
        else:
            position_pnl_percent = (position.entry_price - current_price) / position.entry_price * 100

    # Portfolio
    portfolio = db.get_portfolio_summary()
    available_balance = portfolio.get("available_balance", 10000)
    total_balance = portfolio.get("total_balance", 10000)

    # Recent decisions
    recent_decisions = db.get_recent_decisions(symbol, limit=5)

    db.close()

    return MarketState(
        timestamp=timestamp,
        symbol=symbol,
        timeframe=timeframe,
        current_price=current_price,
        price_change_24h=price_change_24h,
        price_change_7d=price_change_7d,
        sma_10=sma_10,
        sma_20=sma_20,
        sma_50=sma_50,
        ema_12=ema_12,
        ema_26=ema_26,
        rsi_14=rsi_14,
        atr_14=atr_14,
        bb_upper=bb_upper,
        bb_middle=bb_middle,
        bb_lower=bb_lower,
        bb_percent_b=bb_percent_b,
        bb_width=bb_width,
        kc_upper=kc_upper,
        kc_middle=kc_middle,
        kc_lower=kc_lower,
        squeeze_detected=squeeze_detected,
        wave_position=wave_position,
        wave_confidence=wave_confidence,
        wave_description=wave_description,
        wave_3_target=wave_3_target,
        wave_invalidation=wave_invalidation,
        nearest_support=nearest_support,
        nearest_resistance=nearest_resistance,
        support_strength=support_strength,
        resistance_strength=resistance_strength,
        risk_reward_long=risk_reward_long,
        risk_reward_short=risk_reward_short,
        strategy_signals=strategy_signals,
        confluence_level=confluence_level,
        bullish_score=bullish_score,
        bearish_score=bearish_score,
        confluence_summary=confluence_summary,
        has_position=has_position,
        position_side=position_side,
        position_entry_price=position_entry_price,
        position_quantity=position_quantity,
        position_pnl_percent=position_pnl_percent,
        position_stop_loss=position_stop_loss,
        position_take_profit=position_take_profit,
        available_balance=available_balance,
        total_balance=total_balance,
        recent_decisions=recent_decisions,
    )


def generate_market_state_json(
    symbol: str = "BTC/USDT",
    timeframe: str = "1d",
    db_path: str = "trading.db",
) -> str:
    """Generate market state as JSON string."""
    state = generate_market_state(symbol, timeframe, db_path)
    return state.to_json()
