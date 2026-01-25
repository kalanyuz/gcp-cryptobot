import { Candle, IndicatorStrategy, Signal } from '../entities/candle';
import { EMA, RSI } from './indicators';

/**
 * CDC ActionZone color zones
 */
export enum CDCZone {
  Green = 'GREEN', // Buy zone
  Blue = 'BLUE', // Pre-buy 2
  Aqua = 'AQUA', // Pre-buy 1
  Red = 'RED', // Sell zone
  Orange = 'ORANGE', // Pre-sell 2
  Yellow = 'YELLOW', // Pre-sell 1
}

/**
 * Get the current CDC zone based on price and EMA positions
 */
function getCDCZone(
  price: number,
  fastEMA: number,
  slowEMA: number,
): CDCZone {
  const long = fastEMA > slowEMA;
  const short = fastEMA < slowEMA;

  if (long && price > fastEMA) return CDCZone.Green;
  if (short && price > fastEMA && price > slowEMA) return CDCZone.Blue;
  if (short && price > fastEMA && price < slowEMA) return CDCZone.Aqua;
  if (short && price < fastEMA) return CDCZone.Red;
  if (long && price < fastEMA && price < slowEMA) return CDCZone.Orange;
  if (long && price < fastEMA && price > slowEMA) return CDCZone.Yellow;

  return CDCZone.Yellow; // Default
}

/**
 * CDC ActionZone V3 Strategy
 * Based on piriya33's TradingView indicator
 *
 * Buy when entering Green zone (fast EMA > slow EMA AND price > fast EMA)
 * Sell when entering Red zone (fast EMA < slow EMA AND price < fast EMA)
 */
export class CDCActionZoneStrategy implements IndicatorStrategy {
  name = 'CDC ActionZone V3';
  description = 'Dual EMA trend following with colored action zones (by piriya33)';

  private fastPeriod = 12;
  private slowPeriod = 26;
  private usePreZones = false; // If true, buy on Blue/Aqua, sell on Orange/Yellow

  init(params: Record<string, any>): void {
    this.fastPeriod = params.fastPeriod || 12;
    this.slowPeriod = params.slowPeriod || 26;
    this.usePreZones = params.usePreZones || false;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < this.slowPeriod + 1) return Signal.Hold;

    const price = candles[index].close;
    const prevPrice = candles[index - 1].close;

    const fastEMA = EMA(candles, this.fastPeriod, index);
    const slowEMA = EMA(candles, this.slowPeriod, index);
    const prevFastEMA = EMA(candles, this.fastPeriod, index - 1);
    const prevSlowEMA = EMA(candles, this.slowPeriod, index - 1);

    if (!fastEMA || !slowEMA || !prevFastEMA || !prevSlowEMA) return Signal.Hold;

    const currentZone = getCDCZone(price, fastEMA, slowEMA);
    const prevZone = getCDCZone(prevPrice, prevFastEMA, prevSlowEMA);

    // Standard mode: Buy on Green, Sell on Red
    if (!this.usePreZones) {
      // Entering Green zone
      if (currentZone === CDCZone.Green && prevZone !== CDCZone.Green) {
        return Signal.Buy;
      }
      // Entering Red zone
      if (currentZone === CDCZone.Red && prevZone !== CDCZone.Red) {
        return Signal.Sell;
      }
    } else {
      // Pre-zone mode: Buy on Blue/Aqua, Sell on Orange/Yellow
      const buyZones = [CDCZone.Green, CDCZone.Blue, CDCZone.Aqua];
      const sellZones = [CDCZone.Red, CDCZone.Orange, CDCZone.Yellow];

      if (buyZones.includes(currentZone) && sellZones.includes(prevZone)) {
        return Signal.Buy;
      }
      if (sellZones.includes(currentZone) && buyZones.includes(prevZone)) {
        return Signal.Sell;
      }
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number | string> {
    const fastEMA = EMA(candles, this.fastPeriod, index) || 0;
    const slowEMA = EMA(candles, this.slowPeriod, index) || 0;
    const zone = getCDCZone(candles[index].close, fastEMA, slowEMA);

    return {
      fastEMA,
      slowEMA,
      zone,
    };
  }
}

/**
 * Detect RSI divergence
 * Bullish: Price makes lower low, RSI makes higher low
 * Bearish: Price makes higher high, RSI makes lower high
 */
function detectRSIDivergence(
  candles: Candle[],
  index: number,
  rsiPeriod: number,
  lookback: number,
): 'bullish' | 'bearish' | null {
  if (index < rsiPeriod + lookback) return null;

  const currentRSI = RSI(candles, rsiPeriod, index);
  const currentPrice = candles[index].close;

  if (currentRSI === null) return null;

  // Look for swing points in the lookback period
  let lowestPrice = currentPrice;
  let lowestPriceIdx = index;
  let highestPrice = currentPrice;
  let highestPriceIdx = index;

  for (let i = index - lookback; i < index; i++) {
    if (candles[i].low < lowestPrice) {
      lowestPrice = candles[i].low;
      lowestPriceIdx = i;
    }
    if (candles[i].high > highestPrice) {
      highestPrice = candles[i].high;
      highestPriceIdx = i;
    }
  }

  // Check for bullish divergence (price lower low, RSI higher low)
  if (currentPrice <= lowestPrice * 1.02) {
    const prevRSI = RSI(candles, rsiPeriod, lowestPriceIdx);
    if (prevRSI !== null && currentRSI > prevRSI) {
      return 'bullish';
    }
  }

  // Check for bearish divergence (price higher high, RSI lower high)
  if (currentPrice >= highestPrice * 0.98) {
    const prevRSI = RSI(candles, rsiPeriod, highestPriceIdx);
    if (prevRSI !== null && currentRSI < prevRSI) {
      return 'bearish';
    }
  }

  return null;
}

/**
 * CDC ActionZone with RSI Divergence Confirmation
 * Uses RSI divergence to confirm pre-zone entries
 */
export class CDCActionZoneRSIStrategy implements IndicatorStrategy {
  name = 'CDC ActionZone + RSI Divergence';
  description = 'ActionZone with RSI divergence confirmation for pre-zone entries';

  private fastPeriod = 12;
  private slowPeriod = 26;
  private rsiPeriod = 14;
  private divergenceLookback = 14;

  init(params: Record<string, any>): void {
    this.fastPeriod = params.fastPeriod || 12;
    this.slowPeriod = params.slowPeriod || 26;
    this.rsiPeriod = params.rsiPeriod || 14;
    this.divergenceLookback = params.divergenceLookback || 14;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < Math.max(this.slowPeriod, this.rsiPeriod + this.divergenceLookback) + 1) {
      return Signal.Hold;
    }

    const price = candles[index].close;
    const fastEMA = EMA(candles, this.fastPeriod, index);
    const slowEMA = EMA(candles, this.slowPeriod, index);

    if (!fastEMA || !slowEMA) return Signal.Hold;

    const currentZone = getCDCZone(price, fastEMA, slowEMA);
    const rsi = RSI(candles, this.rsiPeriod, index);
    const divergence = detectRSIDivergence(
      candles,
      index,
      this.rsiPeriod,
      this.divergenceLookback,
    );

    // Strong buy: Green zone
    if (currentZone === CDCZone.Green) {
      const prevFastEMA = EMA(candles, this.fastPeriod, index - 1);
      const prevSlowEMA = EMA(candles, this.slowPeriod, index - 1);
      if (prevFastEMA && prevSlowEMA) {
        const prevZone = getCDCZone(candles[index - 1].close, prevFastEMA, prevSlowEMA);
        if (prevZone !== CDCZone.Green) {
          return Signal.Buy;
        }
      }
    }

    // Pre-zone buy with RSI divergence confirmation
    if (
      (currentZone === CDCZone.Blue || currentZone === CDCZone.Aqua) &&
      divergence === 'bullish'
    ) {
      return Signal.Buy;
    }

    // Strong sell: Red zone
    if (currentZone === CDCZone.Red) {
      const prevFastEMA = EMA(candles, this.fastPeriod, index - 1);
      const prevSlowEMA = EMA(candles, this.slowPeriod, index - 1);
      if (prevFastEMA && prevSlowEMA) {
        const prevZone = getCDCZone(candles[index - 1].close, prevFastEMA, prevSlowEMA);
        if (prevZone !== CDCZone.Red) {
          return Signal.Sell;
        }
      }
    }

    // Pre-zone sell with RSI divergence confirmation
    if (
      (currentZone === CDCZone.Orange || currentZone === CDCZone.Yellow) &&
      divergence === 'bearish'
    ) {
      return Signal.Sell;
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number | string | null> {
    const fastEMA = EMA(candles, this.fastPeriod, index) || 0;
    const slowEMA = EMA(candles, this.slowPeriod, index) || 0;
    const rsi = RSI(candles, this.rsiPeriod, index);
    const zone = getCDCZone(candles[index].close, fastEMA, slowEMA);
    const divergence = detectRSIDivergence(
      candles,
      index,
      this.rsiPeriod,
      this.divergenceLookback,
    );

    return {
      fastEMA,
      slowEMA,
      rsi: rsi || 0,
      zone,
      divergence,
    };
  }
}

/**
 * CDC ActionZone with Stop Loss
 * Includes configurable stop loss and trailing stop functionality
 */
export class CDCActionZoneStopLossStrategy implements IndicatorStrategy {
  name = 'CDC ActionZone + Stop Loss';
  description = 'ActionZone with configurable stop loss and trailing stop';

  private fastPeriod = 12;
  private slowPeriod = 26;
  private stopLossPercent = 5; // 5% stop loss
  private useTrailingStop = true;
  private entryPrice: number | null = null;
  private highestSinceEntry: number | null = null;
  private inPosition = false;

  init(params: Record<string, any>): void {
    this.fastPeriod = params.fastPeriod || 12;
    this.slowPeriod = params.slowPeriod || 26;
    this.stopLossPercent = params.stopLossPercent || 5;
    this.useTrailingStop = params.useTrailingStop !== false;
    this.entryPrice = null;
    this.highestSinceEntry = null;
    this.inPosition = false;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < this.slowPeriod + 1) return Signal.Hold;

    const price = candles[index].close;
    const fastEMA = EMA(candles, this.fastPeriod, index);
    const slowEMA = EMA(candles, this.slowPeriod, index);
    const prevFastEMA = EMA(candles, this.fastPeriod, index - 1);
    const prevSlowEMA = EMA(candles, this.slowPeriod, index - 1);

    if (!fastEMA || !slowEMA || !prevFastEMA || !prevSlowEMA) return Signal.Hold;

    const currentZone = getCDCZone(price, fastEMA, slowEMA);
    const prevZone = getCDCZone(candles[index - 1].close, prevFastEMA, prevSlowEMA);

    // Check stop loss if in position
    if (this.inPosition && this.entryPrice) {
      // Update highest price for trailing stop
      if (this.highestSinceEntry === null || price > this.highestSinceEntry) {
        this.highestSinceEntry = price;
      }

      // Calculate stop price
      const referencePrice = this.useTrailingStop
        ? this.highestSinceEntry
        : this.entryPrice;
      const stopPrice = referencePrice * (1 - this.stopLossPercent / 100);

      // Stop loss triggered
      if (price < stopPrice) {
        this.inPosition = false;
        this.entryPrice = null;
        this.highestSinceEntry = null;
        return Signal.Sell;
      }
    }

    // Entry signal: Entering Green zone
    if (!this.inPosition && currentZone === CDCZone.Green && prevZone !== CDCZone.Green) {
      this.inPosition = true;
      this.entryPrice = price;
      this.highestSinceEntry = price;
      return Signal.Buy;
    }

    // Exit signal: Entering Red zone (overrides stop loss)
    if (this.inPosition && currentZone === CDCZone.Red && prevZone !== CDCZone.Red) {
      this.inPosition = false;
      this.entryPrice = null;
      this.highestSinceEntry = null;
      return Signal.Sell;
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number | string | null> {
    const fastEMA = EMA(candles, this.fastPeriod, index) || 0;
    const slowEMA = EMA(candles, this.slowPeriod, index) || 0;
    const zone = getCDCZone(candles[index].close, fastEMA, slowEMA);

    let stopPrice: number | null = null;
    if (this.inPosition && this.entryPrice) {
      const referencePrice = this.useTrailingStop
        ? this.highestSinceEntry || this.entryPrice
        : this.entryPrice;
      stopPrice = referencePrice * (1 - this.stopLossPercent / 100);
    }

    return {
      fastEMA,
      slowEMA,
      zone,
      entryPrice: this.entryPrice,
      stopPrice,
      inPosition: this.inPosition ? 1 : 0,
    };
  }
}

/**
 * Register CDC strategies with the strategy factory
 */
export function getCDCStrategy(name: string): IndicatorStrategy | null {
  const strategies: Record<string, IndicatorStrategy> = {
    'cdc-actionzone': new CDCActionZoneStrategy(),
    'cdc-actionzone-rsi': new CDCActionZoneRSIStrategy(),
    'cdc-actionzone-stoploss': new CDCActionZoneStopLossStrategy(),
  };

  return strategies[name] || null;
}

/**
 * List CDC strategies
 */
export function listCDCStrategies(): { name: string; description: string }[] {
  return [
    {
      name: 'cdc-actionzone',
      description: 'CDC ActionZone V3 - Dual EMA trend following (by piriya33)',
    },
    {
      name: 'cdc-actionzone-rsi',
      description: 'CDC ActionZone + RSI Divergence - Pre-zone confirmation with RSI',
    },
    {
      name: 'cdc-actionzone-stoploss',
      description: 'CDC ActionZone + Stop Loss - With trailing stop support',
    },
  ];
}
