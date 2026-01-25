import { Candle, IndicatorStrategy, Signal } from '../entities/candle';
import { SMA, EMA, RSI, MACD, BollingerBands, Stochastic, ATR } from './indicators';
import {
  CDCActionZoneStrategy,
  CDCActionZoneRSIStrategy,
  CDCActionZoneStopLossStrategy,
} from './cdc-strategies';
import {
  CDCConfirmedSMAStrategy,
  VolatilityAdaptiveStrategy,
  DualConfirmationStrategy,
  SMAEntryCDCExitStrategy,
  CDCEntrySMAExitStrategy,
} from './hybrid-strategies';
import { FibonacciRetracementStrategy } from '../tools/fibonacci';

/**
 * SMA Crossover Strategy
 * Buy when fast SMA crosses above slow SMA
 * Sell when fast SMA crosses below slow SMA
 */
export class SMACrossoverStrategy implements IndicatorStrategy {
  name = 'SMA Crossover';
  description = 'Buy when fast SMA crosses above slow SMA, sell on cross below';

  private fastPeriod = 10;
  private slowPeriod = 20;

  init(params: Record<string, any>): void {
    this.fastPeriod = params.fastPeriod || 10;
    this.slowPeriod = params.slowPeriod || 20;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < this.slowPeriod) return Signal.Hold;

    const fastSMA = SMA(candles, this.fastPeriod, index);
    const slowSMA = SMA(candles, this.slowPeriod, index);
    const prevFastSMA = SMA(candles, this.fastPeriod, index - 1);
    const prevSlowSMA = SMA(candles, this.slowPeriod, index - 1);

    if (!fastSMA || !slowSMA || !prevFastSMA || !prevSlowSMA) return Signal.Hold;

    // Bullish crossover
    if (prevFastSMA <= prevSlowSMA && fastSMA > slowSMA) {
      return Signal.Buy;
    }

    // Bearish crossover
    if (prevFastSMA >= prevSlowSMA && fastSMA < slowSMA) {
      return Signal.Sell;
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number> {
    return {
      fastSMA: SMA(candles, this.fastPeriod, index) || 0,
      slowSMA: SMA(candles, this.slowPeriod, index) || 0,
    };
  }
}

/**
 * RSI Strategy
 * Buy when RSI crosses above oversold level
 * Sell when RSI crosses below overbought level
 */
export class RSIStrategy implements IndicatorStrategy {
  name = 'RSI Overbought/Oversold';
  description = 'Buy on oversold, sell on overbought';

  private period = 14;
  private oversold = 30;
  private overbought = 70;

  init(params: Record<string, any>): void {
    this.period = params.period || 14;
    this.oversold = params.oversold || 30;
    this.overbought = params.overbought || 70;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < this.period + 1) return Signal.Hold;

    const rsi = RSI(candles, this.period, index);
    const prevRsi = RSI(candles, this.period, index - 1);

    if (rsi === null || prevRsi === null) return Signal.Hold;

    // Buy when RSI crosses above oversold
    if (prevRsi <= this.oversold && rsi > this.oversold) {
      return Signal.Buy;
    }

    // Sell when RSI crosses below overbought
    if (prevRsi >= this.overbought && rsi < this.overbought) {
      return Signal.Sell;
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number> {
    return {
      rsi: RSI(candles, this.period, index) || 0,
    };
  }
}

/**
 * MACD Strategy
 * Buy when MACD crosses above signal line
 * Sell when MACD crosses below signal line
 */
export class MACDStrategy implements IndicatorStrategy {
  name = 'MACD Crossover';
  description = 'Buy when MACD crosses above signal, sell on cross below';

  private fastPeriod = 12;
  private slowPeriod = 26;
  private signalPeriod = 9;

  init(params: Record<string, any>): void {
    this.fastPeriod = params.fastPeriod || 12;
    this.slowPeriod = params.slowPeriod || 26;
    this.signalPeriod = params.signalPeriod || 9;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < this.slowPeriod + this.signalPeriod) return Signal.Hold;

    const macd = MACD(candles, this.fastPeriod, this.slowPeriod, this.signalPeriod, index);
    const prevMacd = MACD(
      candles,
      this.fastPeriod,
      this.slowPeriod,
      this.signalPeriod,
      index - 1,
    );

    if (!macd || !prevMacd) return Signal.Hold;

    // Bullish crossover
    if (prevMacd.histogram <= 0 && macd.histogram > 0) {
      return Signal.Buy;
    }

    // Bearish crossover
    if (prevMacd.histogram >= 0 && macd.histogram < 0) {
      return Signal.Sell;
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number> {
    const macd = MACD(candles, this.fastPeriod, this.slowPeriod, this.signalPeriod, index);
    return {
      macd: macd?.macd || 0,
      signal: macd?.signal || 0,
      histogram: macd?.histogram || 0,
    };
  }
}

/**
 * Bollinger Bands Strategy
 * Buy when price touches lower band
 * Sell when price touches upper band
 */
export class BollingerBandsStrategy implements IndicatorStrategy {
  name = 'Bollinger Bands Mean Reversion';
  description = 'Buy at lower band, sell at upper band';

  private period = 20;
  private stdDev = 2;

  init(params: Record<string, any>): void {
    this.period = params.period || 20;
    this.stdDev = params.stdDev || 2;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < this.period) return Signal.Hold;

    const bb = BollingerBands(candles, this.period, this.stdDev, index);
    if (!bb) return Signal.Hold;

    const close = candles[index].close;
    const prevClose = candles[index - 1].close;

    // Buy when price crosses below lower band
    if (prevClose >= bb.lower && close < bb.lower) {
      return Signal.Buy;
    }

    // Sell when price crosses above upper band
    if (prevClose <= bb.upper && close > bb.upper) {
      return Signal.Sell;
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number> {
    const bb = BollingerBands(candles, this.period, this.stdDev, index);
    return {
      upper: bb?.upper || 0,
      middle: bb?.middle || 0,
      lower: bb?.lower || 0,
    };
  }
}

/**
 * EMA + RSI Combo Strategy
 * Buy when price above EMA and RSI oversold
 * Sell when price below EMA and RSI overbought
 */
export class EmaRsiStrategy implements IndicatorStrategy {
  name = 'EMA + RSI Combo';
  description = 'Buy when price > EMA and RSI oversold, sell when price < EMA and RSI overbought';

  private emaPeriod = 50;
  private rsiPeriod = 14;
  private oversold = 30;
  private overbought = 70;

  init(params: Record<string, any>): void {
    this.emaPeriod = params.emaPeriod || 50;
    this.rsiPeriod = params.rsiPeriod || 14;
    this.oversold = params.oversold || 30;
    this.overbought = params.overbought || 70;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < Math.max(this.emaPeriod, this.rsiPeriod + 1)) return Signal.Hold;

    const ema = EMA(candles, this.emaPeriod, index);
    const rsi = RSI(candles, this.rsiPeriod, index);

    if (ema === null || rsi === null) return Signal.Hold;

    const close = candles[index].close;

    // Buy: price above EMA and RSI coming out of oversold
    if (close > ema && rsi > this.oversold && rsi < 50) {
      return Signal.Buy;
    }

    // Sell: price below EMA and RSI coming out of overbought
    if (close < ema && rsi < this.overbought && rsi > 50) {
      return Signal.Sell;
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number> {
    return {
      ema: EMA(candles, this.emaPeriod, index) || 0,
      rsi: RSI(candles, this.rsiPeriod, index) || 0,
    };
  }
}

/**
 * Stochastic Strategy
 * Buy when %K crosses above %D in oversold zone
 * Sell when %K crosses below %D in overbought zone
 */
export class StochasticStrategy implements IndicatorStrategy {
  name = 'Stochastic Crossover';
  description = 'Buy on bullish %K/%D cross in oversold, sell on bearish cross in overbought';

  private kPeriod = 14;
  private dPeriod = 3;
  private oversold = 20;
  private overbought = 80;

  init(params: Record<string, any>): void {
    this.kPeriod = params.kPeriod || 14;
    this.dPeriod = params.dPeriod || 3;
    this.oversold = params.oversold || 20;
    this.overbought = params.overbought || 80;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < this.kPeriod + this.dPeriod) return Signal.Hold;

    const stoch = Stochastic(candles, this.kPeriod, this.dPeriod, index);
    const prevStoch = Stochastic(candles, this.kPeriod, this.dPeriod, index - 1);

    if (!stoch || !prevStoch) return Signal.Hold;

    // Buy: %K crosses above %D in oversold zone
    if (stoch.k < this.oversold && prevStoch.k <= prevStoch.d && stoch.k > stoch.d) {
      return Signal.Buy;
    }

    // Sell: %K crosses below %D in overbought zone
    if (stoch.k > this.overbought && prevStoch.k >= prevStoch.d && stoch.k < stoch.d) {
      return Signal.Sell;
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number> {
    const stoch = Stochastic(candles, this.kPeriod, this.dPeriod, index);
    return {
      k: stoch?.k || 0,
      d: stoch?.d || 0,
    };
  }
}

/**
 * Triple EMA (TEMA) Strategy
 * Uses 3 EMAs for trend confirmation
 */
export class TripleEMAStrategy implements IndicatorStrategy {
  name = 'Triple EMA';
  description = 'Buy when fast > medium > slow EMAs align, sell when reverse';

  private fastPeriod = 8;
  private mediumPeriod = 21;
  private slowPeriod = 55;

  init(params: Record<string, any>): void {
    this.fastPeriod = params.fastPeriod || 8;
    this.mediumPeriod = params.mediumPeriod || 21;
    this.slowPeriod = params.slowPeriod || 55;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < this.slowPeriod) return Signal.Hold;

    const fastEMA = EMA(candles, this.fastPeriod, index);
    const mediumEMA = EMA(candles, this.mediumPeriod, index);
    const slowEMA = EMA(candles, this.slowPeriod, index);

    const prevFastEMA = EMA(candles, this.fastPeriod, index - 1);
    const prevMediumEMA = EMA(candles, this.mediumPeriod, index - 1);
    const prevSlowEMA = EMA(candles, this.slowPeriod, index - 1);

    if (!fastEMA || !mediumEMA || !slowEMA) return Signal.Hold;
    if (!prevFastEMA || !prevMediumEMA || !prevSlowEMA) return Signal.Hold;

    const bullishAlignment = fastEMA > mediumEMA && mediumEMA > slowEMA;
    const prevBullishAlignment = prevFastEMA > prevMediumEMA && prevMediumEMA > prevSlowEMA;

    const bearishAlignment = fastEMA < mediumEMA && mediumEMA < slowEMA;
    const prevBearishAlignment = prevFastEMA < prevMediumEMA && prevMediumEMA < prevSlowEMA;

    // Buy when EMAs align bullish
    if (!prevBullishAlignment && bullishAlignment) {
      return Signal.Buy;
    }

    // Sell when EMAs align bearish
    if (!prevBearishAlignment && bearishAlignment) {
      return Signal.Sell;
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number> {
    return {
      fastEMA: EMA(candles, this.fastPeriod, index) || 0,
      mediumEMA: EMA(candles, this.mediumPeriod, index) || 0,
      slowEMA: EMA(candles, this.slowPeriod, index) || 0,
    };
  }
}

/**
 * Volatility Breakout Strategy
 * Uses ATR for volatility-based entries
 */
export class VolatilityBreakoutStrategy implements IndicatorStrategy {
  name = 'ATR Volatility Breakout';
  description = 'Buy on high volatility breakout above recent high';

  private atrPeriod = 14;
  private lookback = 20;
  private atrMultiplier = 1.5;

  init(params: Record<string, any>): void {
    this.atrPeriod = params.atrPeriod || 14;
    this.lookback = params.lookback || 20;
    this.atrMultiplier = params.atrMultiplier || 1.5;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < Math.max(this.atrPeriod, this.lookback)) return Signal.Hold;

    const atr = ATR(candles, this.atrPeriod, index);
    if (atr === null) return Signal.Hold;

    // Find recent high/low
    let recentHigh = -Infinity;
    let recentLow = Infinity;
    for (let i = index - this.lookback; i < index; i++) {
      recentHigh = Math.max(recentHigh, candles[i].high);
      recentLow = Math.min(recentLow, candles[i].low);
    }

    const close = candles[index].close;
    const prevClose = candles[index - 1].close;
    const breakoutThreshold = atr * this.atrMultiplier;

    // Buy on breakout above recent high
    if (close > recentHigh && close - prevClose > breakoutThreshold) {
      return Signal.Buy;
    }

    // Sell on breakdown below recent low
    if (close < recentLow && prevClose - close > breakoutThreshold) {
      return Signal.Sell;
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number> {
    return {
      atr: ATR(candles, this.atrPeriod, index) || 0,
    };
  }
}

/**
 * Factory to get strategy by name
 */
export function getStrategy(name: string): IndicatorStrategy | null {
  const strategies: Record<string, IndicatorStrategy> = {
    // Standard strategies
    'sma-crossover': new SMACrossoverStrategy(),
    rsi: new RSIStrategy(),
    macd: new MACDStrategy(),
    'bollinger-bands': new BollingerBandsStrategy(),
    'ema-rsi': new EmaRsiStrategy(),
    stochastic: new StochasticStrategy(),
    'triple-ema': new TripleEMAStrategy(),
    'volatility-breakout': new VolatilityBreakoutStrategy(),
    // CDC ActionZone strategies (by piriya33)
    'cdc-actionzone': new CDCActionZoneStrategy(),
    'cdc-actionzone-rsi': new CDCActionZoneRSIStrategy(),
    'cdc-actionzone-stoploss': new CDCActionZoneStopLossStrategy(),
    // Fibonacci strategy
    fibonacci: new FibonacciRetracementStrategy(),
    // Hybrid strategies (combining SMA and CDC)
    'cdc-confirmed-sma': new CDCConfirmedSMAStrategy(),
    'volatility-adaptive': new VolatilityAdaptiveStrategy(),
    'dual-confirmation': new DualConfirmationStrategy(),
    'sma-entry-cdc-exit': new SMAEntryCDCExitStrategy(),
    'cdc-entry-sma-exit': new CDCEntrySMAExitStrategy(),
  };

  return strategies[name] || null;
}

/**
 * List all available strategies
 */
export function listStrategies(): { name: string; description: string }[] {
  return [
    // Standard strategies
    { name: 'sma-crossover', description: 'SMA Crossover - Buy when fast SMA crosses above slow SMA' },
    { name: 'rsi', description: 'RSI - Buy on oversold, sell on overbought' },
    { name: 'macd', description: 'MACD Crossover - Buy when MACD crosses above signal line' },
    { name: 'bollinger-bands', description: 'Bollinger Bands - Mean reversion at bands' },
    { name: 'ema-rsi', description: 'EMA + RSI Combo - Trend + momentum confirmation' },
    { name: 'stochastic', description: 'Stochastic - %K/%D crossovers in extreme zones' },
    { name: 'triple-ema', description: 'Triple EMA - Three EMA trend alignment' },
    { name: 'volatility-breakout', description: 'ATR Breakout - Volatility-based entries' },
    // CDC ActionZone strategies (by piriya33)
    { name: 'cdc-actionzone', description: 'CDC ActionZone V3 - Dual EMA trend following (piriya33)' },
    { name: 'cdc-actionzone-rsi', description: 'CDC ActionZone + RSI - With divergence confirmation' },
    { name: 'cdc-actionzone-stoploss', description: 'CDC ActionZone + Stop Loss - With trailing stop' },
    // Fibonacci strategy
    { name: 'fibonacci', description: 'Fibonacci Retracement - Buy at Fib levels, sell at extensions' },
    // Hybrid strategies (combining SMA and CDC)
    { name: 'cdc-confirmed-sma', description: 'CDC-Confirmed SMA - SMA timing + CDC zone confirmation' },
    { name: 'volatility-adaptive', description: 'Volatility Adaptive - Switches SMA/CDC based on market volatility' },
    { name: 'dual-confirmation', description: 'Dual Confirmation - Requires both SMA and CDC to agree' },
    { name: 'sma-entry-cdc-exit', description: 'SMA Entry / CDC Exit - Fast entries, filtered exits' },
    { name: 'cdc-entry-sma-exit', description: 'CDC Entry / SMA Exit - Quality entries, fast exits' },
  ];
}
