import { Candle, IndicatorStrategy, Signal } from '../entities/candle';
import { EMA } from './indicators';

/**
 * CDC ActionZone color zones
 * Based on piriya33's TradingView indicator
 */
export enum CDCZone {
  Green = 'GREEN',   // Buy zone: fast EMA > slow EMA AND price > fast EMA
  Blue = 'BLUE',     // Pre-buy 2
  Aqua = 'AQUA',     // Pre-buy 1
  Red = 'RED',       // Sell zone: fast EMA < slow EMA AND price < fast EMA
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
 * Uses dual EMA (12/26) with colored zones based on:
 * 1. Trend direction (fast EMA vs slow EMA)
 * 2. Price position relative to EMAs
 *
 * Buy when entering Green zone (fast EMA > slow EMA AND price > fast EMA)
 * Sell when entering Red zone (fast EMA < slow EMA AND price < fast EMA)
 *
 * The price confirmation filter reduces false signals in choppy markets.
 *
 * Best for: Markets with frequent pullbacks, choppy conditions
 * Higher win rate but potentially misses some moves due to filtering
 */
export class CDCActionZoneStrategy implements IndicatorStrategy {
  name = 'CDC ActionZone V3';
  description = 'Dual EMA trend following with colored action zones (by piriya33)';

  private fastPeriod = 12;
  private slowPeriod = 26;

  init(params: Record<string, any>): void {
    this.fastPeriod = params.fastPeriod || 12;
    this.slowPeriod = params.slowPeriod || 26;
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

    // Entering Green zone = Buy signal
    if (currentZone === CDCZone.Green && prevZone !== CDCZone.Green) {
      return Signal.Buy;
    }

    // Entering Red zone = Sell signal
    if (currentZone === CDCZone.Red && prevZone !== CDCZone.Red) {
      return Signal.Sell;
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number | string | null> {
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
