import { Candle } from '../entities/candle';

/**
 * Technical indicator calculation utilities
 * These can be used by any strategy implementation
 */

/**
 * Simple Moving Average
 */
export function SMA(candles: Candle[], period: number, index: number): number | null {
  if (index < period - 1) return null;

  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    sum += candles[i].close;
  }
  return sum / period;
}

/**
 * Exponential Moving Average
 */
export function EMA(candles: Candle[], period: number, index: number): number | null {
  if (index < period - 1) return null;

  const multiplier = 2 / (period + 1);

  // Initialize with SMA for the first EMA value
  if (index === period - 1) {
    return SMA(candles, period, index);
  }

  const prevEMA = EMA(candles, period, index - 1);
  if (prevEMA === null) return null;

  return (candles[index].close - prevEMA) * multiplier + prevEMA;
}

/**
 * Non-recursive EMA for better performance
 */
export function EMAFast(closes: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  // Start with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i];
    ema.push(NaN);
  }
  ema[period - 1] = sum / period;

  // Calculate EMA
  for (let i = period; i < closes.length; i++) {
    ema.push((closes[i] - ema[i - 1]) * multiplier + ema[i - 1]);
  }

  return ema;
}

/**
 * Relative Strength Index
 */
export function RSI(candles: Candle[], period: number, index: number): number | null {
  if (index < period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = index - period + 1; i <= index; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * MACD (Moving Average Convergence Divergence)
 */
export function MACD(
  candles: Candle[],
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number,
  index: number,
): { macd: number; signal: number; histogram: number } | null {
  if (index < slowPeriod + signalPeriod - 1) return null;

  const closes = candles.slice(0, index + 1).map((c) => c.close);
  const fastEMA = EMAFast(closes, fastPeriod);
  const slowEMA = EMAFast(closes, slowPeriod);

  // Calculate MACD line
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(fastEMA[i]) || isNaN(slowEMA[i])) {
      macdLine.push(NaN);
    } else {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
  }

  // Calculate signal line (EMA of MACD)
  const validMacd = macdLine.filter((v) => !isNaN(v));
  if (validMacd.length < signalPeriod) return null;

  const signalEMA = EMAFast(validMacd, signalPeriod);
  const signal = signalEMA[signalEMA.length - 1];
  const macd = macdLine[macdLine.length - 1];

  if (isNaN(signal) || isNaN(macd)) return null;

  return {
    macd,
    signal,
    histogram: macd - signal,
  };
}

/**
 * Bollinger Bands
 */
export function BollingerBands(
  candles: Candle[],
  period: number,
  stdDev: number,
  index: number,
): { upper: number; middle: number; lower: number } | null {
  if (index < period - 1) return null;

  const middle = SMA(candles, period, index);
  if (middle === null) return null;

  // Calculate standard deviation
  let sumSquares = 0;
  for (let i = index - period + 1; i <= index; i++) {
    sumSquares += Math.pow(candles[i].close - middle, 2);
  }
  const std = Math.sqrt(sumSquares / period);

  return {
    upper: middle + stdDev * std,
    middle,
    lower: middle - stdDev * std,
  };
}

/**
 * Average True Range
 */
export function ATR(candles: Candle[], period: number, index: number): number | null {
  if (index < period) return null;

  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    sum += tr;
  }

  return sum / period;
}

/**
 * Stochastic Oscillator
 */
export function Stochastic(
  candles: Candle[],
  kPeriod: number,
  dPeriod: number,
  index: number,
): { k: number; d: number } | null {
  if (index < kPeriod + dPeriod - 2) return null;

  // Calculate %K values for the last dPeriod candles
  const kValues: number[] = [];

  for (let i = index - dPeriod + 1; i <= index; i++) {
    let highest = -Infinity;
    let lowest = Infinity;

    for (let j = i - kPeriod + 1; j <= i; j++) {
      highest = Math.max(highest, candles[j].high);
      lowest = Math.min(lowest, candles[j].low);
    }

    const k = highest === lowest ? 50 : ((candles[i].close - lowest) / (highest - lowest)) * 100;
    kValues.push(k);
  }

  const currentK = kValues[kValues.length - 1];
  const d = kValues.reduce((sum, v) => sum + v, 0) / kValues.length;

  return { k: currentK, d };
}

/**
 * On-Balance Volume
 */
export function OBV(candles: Candle[], index: number): number {
  let obv = 0;

  for (let i = 1; i <= index; i++) {
    if (candles[i].close > candles[i - 1].close) {
      obv += candles[i].volume;
    } else if (candles[i].close < candles[i - 1].close) {
      obv -= candles[i].volume;
    }
  }

  return obv;
}

/**
 * Volume Weighted Average Price
 */
export function VWAP(candles: Candle[], index: number): number | null {
  if (index < 0) return null;

  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i <= index; i++) {
    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumulativeTPV += typicalPrice * candles[i].volume;
    cumulativeVolume += candles[i].volume;
  }

  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : null;
}

/**
 * Commodity Channel Index
 */
export function CCI(candles: Candle[], period: number, index: number): number | null {
  if (index < period - 1) return null;

  // Calculate typical prices
  const typicalPrices: number[] = [];
  for (let i = index - period + 1; i <= index; i++) {
    typicalPrices.push((candles[i].high + candles[i].low + candles[i].close) / 3);
  }

  // Calculate SMA of typical price
  const smaTP = typicalPrices.reduce((sum, tp) => sum + tp, 0) / period;

  // Calculate mean deviation
  const meanDev =
    typicalPrices.reduce((sum, tp) => sum + Math.abs(tp - smaTP), 0) / period;

  if (meanDev === 0) return 0;

  const currentTP = typicalPrices[typicalPrices.length - 1];
  return (currentTP - smaTP) / (0.015 * meanDev);
}

/**
 * Williams %R
 */
export function WilliamsR(candles: Candle[], period: number, index: number): number | null {
  if (index < period - 1) return null;

  let highest = -Infinity;
  let lowest = Infinity;

  for (let i = index - period + 1; i <= index; i++) {
    highest = Math.max(highest, candles[i].high);
    lowest = Math.min(lowest, candles[i].low);
  }

  if (highest === lowest) return -50;

  return ((highest - candles[index].close) / (highest - lowest)) * -100;
}

/**
 * Money Flow Index
 */
export function MFI(candles: Candle[], period: number, index: number): number | null {
  if (index < period) return null;

  let positiveFlow = 0;
  let negativeFlow = 0;

  for (let i = index - period + 1; i <= index; i++) {
    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const prevTypicalPrice =
      (candles[i - 1].high + candles[i - 1].low + candles[i - 1].close) / 3;
    const rawMoneyFlow = typicalPrice * candles[i].volume;

    if (typicalPrice > prevTypicalPrice) {
      positiveFlow += rawMoneyFlow;
    } else if (typicalPrice < prevTypicalPrice) {
      negativeFlow += rawMoneyFlow;
    }
  }

  if (negativeFlow === 0) return 100;

  const moneyRatio = positiveFlow / negativeFlow;
  return 100 - 100 / (1 + moneyRatio);
}
