import { Candle, IndicatorStrategy, Signal } from '../entities/candle';
import { SMA } from './indicators';
import { CDCActionZoneStrategy } from './cdc-strategies';
import { CDCConfirmedSMAStrategy } from './hybrid-strategies';

/**
 * SMA Crossover Strategy
 * Buy when fast SMA crosses above slow SMA
 * Sell when fast SMA crosses below slow SMA
 *
 * Best for: Clean trending markets (BTC, ETH)
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
 * Factory to get strategy by name
 */
export function getStrategy(name: string): IndicatorStrategy | null {
  const strategies: Record<string, IndicatorStrategy> = {
    'sma-crossover': new SMACrossoverStrategy(),
    'cdc-actionzone': new CDCActionZoneStrategy(),
    'cdc-confirmed-sma': new CDCConfirmedSMAStrategy(),
  };

  return strategies[name] || null;
}

/**
 * List all available strategies
 */
export function listStrategies(): { name: string; description: string }[] {
  return [
    {
      name: 'sma-crossover',
      description: 'SMA Crossover - Fast & simple, best for trending markets (BTC)',
    },
    {
      name: 'cdc-actionzone',
      description: 'CDC ActionZone V3 - Filtered signals with zone confirmation (piriya33)',
    },
    {
      name: 'cdc-confirmed-sma',
      description: 'CDC-Confirmed SMA - Best of both: SMA timing + CDC filter (volatile assets)',
    },
  ];
}
