import { Candle, IndicatorStrategy, Signal } from '../entities/candle';
import { SMA, EMA, ATR } from './indicators';

/**
 * CDC Zone colors for reference
 */
enum CDCZone {
  Green = 'GREEN',   // Strong buy zone
  Blue = 'BLUE',     // Pre-buy 2
  Aqua = 'AQUA',     // Pre-buy 1
  Red = 'RED',       // Strong sell zone
  Orange = 'ORANGE', // Pre-sell 2
  Yellow = 'YELLOW', // Pre-sell 1
}

/**
 * Get CDC zone based on price and EMA positions
 */
function getCDCZone(price: number, fastEMA: number, slowEMA: number): CDCZone {
  const long = fastEMA > slowEMA;
  const short = fastEMA < slowEMA;

  if (long && price > fastEMA) return CDCZone.Green;
  if (short && price > fastEMA && price > slowEMA) return CDCZone.Blue;
  if (short && price > fastEMA && price < slowEMA) return CDCZone.Aqua;
  if (short && price < fastEMA) return CDCZone.Red;
  if (long && price < fastEMA && price < slowEMA) return CDCZone.Orange;
  if (long && price < fastEMA && price > slowEMA) return CDCZone.Yellow;

  return CDCZone.Yellow;
}

/**
 * HYBRID 1: CDC-Confirmed SMA (Safety Focus)
 *
 * Logic:
 * - Uses SMA crossover for entry timing (fast response)
 * - But ONLY enters if CDC zone confirms the direction
 * - BUY: SMA bullish crossover AND price in Green/Blue/Aqua zone
 * - SELL: SMA bearish crossover AND price in Red/Orange/Yellow zone
 *
 * This combines SMA's timing with CDC's confirmation filter.
 */
export class CDCConfirmedSMAStrategy implements IndicatorStrategy {
  name = 'CDC-Confirmed SMA';
  description = 'SMA crossover timing with CDC zone confirmation for safety';

  private smaFast = 10;
  private smaSlow = 20;
  private cdcFast = 12;
  private cdcSlow = 26;

  init(params: Record<string, any>): void {
    this.smaFast = params.smaFast || 10;
    this.smaSlow = params.smaSlow || 20;
    this.cdcFast = params.cdcFast || 12;
    this.cdcSlow = params.cdcSlow || 26;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < Math.max(this.smaSlow, this.cdcSlow) + 1) return Signal.Hold;

    const price = candles[index].close;

    // SMA signals
    const fastSMA = SMA(candles, this.smaFast, index);
    const slowSMA = SMA(candles, this.smaSlow, index);
    const prevFastSMA = SMA(candles, this.smaFast, index - 1);
    const prevSlowSMA = SMA(candles, this.smaSlow, index - 1);

    if (!fastSMA || !slowSMA || !prevFastSMA || !prevSlowSMA) return Signal.Hold;

    // CDC zone
    const fastEMA = EMA(candles, this.cdcFast, index);
    const slowEMA = EMA(candles, this.cdcSlow, index);
    if (!fastEMA || !slowEMA) return Signal.Hold;

    const zone = getCDCZone(price, fastEMA, slowEMA);
    const bullishZones = [CDCZone.Green, CDCZone.Blue, CDCZone.Aqua];
    const bearishZones = [CDCZone.Red, CDCZone.Orange, CDCZone.Yellow];

    // SMA bullish crossover
    const smaBullishCross = prevFastSMA <= prevSlowSMA && fastSMA > slowSMA;
    // SMA bearish crossover
    const smaBearishCross = prevFastSMA >= prevSlowSMA && fastSMA < slowSMA;

    // Only enter if CDC zone confirms
    if (smaBullishCross && bullishZones.includes(zone)) {
      return Signal.Buy;
    }
    if (smaBearishCross && bearishZones.includes(zone)) {
      return Signal.Sell;
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number | string | null> {
    const fastSMA = SMA(candles, this.smaFast, index) || 0;
    const slowSMA = SMA(candles, this.smaSlow, index) || 0;
    const fastEMA = EMA(candles, this.cdcFast, index) || 0;
    const slowEMA = EMA(candles, this.cdcSlow, index) || 0;
    const zone = getCDCZone(candles[index].close, fastEMA, slowEMA);

    return { fastSMA, slowSMA, fastEMA, slowEMA, zone };
  }
}

/**
 * HYBRID 2: Volatility Adaptive Strategy (Smart Switching)
 *
 * Logic:
 * - Measures recent volatility using ATR
 * - HIGH volatility (choppy market) → Use CDC ActionZone (defensive)
 * - LOW volatility (trending market) → Use SMA Crossover (aggressive)
 *
 * This dynamically switches strategies based on market conditions.
 */
export class VolatilityAdaptiveStrategy implements IndicatorStrategy {
  name = 'Volatility Adaptive';
  description = 'Switches between SMA (trending) and CDC (choppy) based on volatility';

  private atrPeriod = 14;
  private volatilityThreshold = 0.03; // 3% ATR/price ratio = high volatility
  private smaFast = 10;
  private smaSlow = 20;
  private cdcFast = 12;
  private cdcSlow = 26;

  init(params: Record<string, any>): void {
    this.atrPeriod = params.atrPeriod || 14;
    this.volatilityThreshold = params.volatilityThreshold || 0.03;
    this.smaFast = params.smaFast || 10;
    this.smaSlow = params.smaSlow || 20;
    this.cdcFast = params.cdcFast || 12;
    this.cdcSlow = params.cdcSlow || 26;
  }

  calculate(candles: Candle[], index: number): Signal {
    const minPeriod = Math.max(this.smaSlow, this.cdcSlow, this.atrPeriod) + 1;
    if (index < minPeriod) return Signal.Hold;

    const price = candles[index].close;
    const atr = ATR(candles, this.atrPeriod, index);
    if (!atr) return Signal.Hold;

    // Volatility ratio: ATR as percentage of price
    const volatilityRatio = atr / price;
    const isHighVolatility = volatilityRatio > this.volatilityThreshold;

    if (isHighVolatility) {
      // Use CDC ActionZone logic (defensive)
      return this.cdcSignal(candles, index);
    } else {
      // Use SMA Crossover logic (aggressive)
      return this.smaSignal(candles, index);
    }
  }

  private smaSignal(candles: Candle[], index: number): Signal {
    const fastSMA = SMA(candles, this.smaFast, index);
    const slowSMA = SMA(candles, this.smaSlow, index);
    const prevFastSMA = SMA(candles, this.smaFast, index - 1);
    const prevSlowSMA = SMA(candles, this.smaSlow, index - 1);

    if (!fastSMA || !slowSMA || !prevFastSMA || !prevSlowSMA) return Signal.Hold;

    if (prevFastSMA <= prevSlowSMA && fastSMA > slowSMA) return Signal.Buy;
    if (prevFastSMA >= prevSlowSMA && fastSMA < slowSMA) return Signal.Sell;

    return Signal.Hold;
  }

  private cdcSignal(candles: Candle[], index: number): Signal {
    const price = candles[index].close;
    const prevPrice = candles[index - 1].close;

    const fastEMA = EMA(candles, this.cdcFast, index);
    const slowEMA = EMA(candles, this.cdcSlow, index);
    const prevFastEMA = EMA(candles, this.cdcFast, index - 1);
    const prevSlowEMA = EMA(candles, this.cdcSlow, index - 1);

    if (!fastEMA || !slowEMA || !prevFastEMA || !prevSlowEMA) return Signal.Hold;

    const currentZone = getCDCZone(price, fastEMA, slowEMA);
    const prevZone = getCDCZone(prevPrice, prevFastEMA, prevSlowEMA);

    if (currentZone === CDCZone.Green && prevZone !== CDCZone.Green) return Signal.Buy;
    if (currentZone === CDCZone.Red && prevZone !== CDCZone.Red) return Signal.Sell;

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number | string | null> {
    const atr = ATR(candles, this.atrPeriod, index) || 0;
    const price = candles[index].close;
    const volatilityRatio = atr / price;
    const mode = volatilityRatio > this.volatilityThreshold ? 'CDC' : 'SMA';

    return { atr, volatilityRatio, mode };
  }
}

/**
 * HYBRID 3: Dual Confirmation Strategy (Maximum Safety)
 *
 * Logic:
 * - Only enters when BOTH SMA and CDC agree within a lookback window
 * - BUY: SMA bullish cross AND CDC enters Green zone (within N bars)
 * - SELL: SMA bearish cross AND CDC enters Red zone (within N bars)
 *
 * Fewer trades but highest conviction signals.
 */
export class DualConfirmationStrategy implements IndicatorStrategy {
  name = 'Dual Confirmation';
  description = 'Requires both SMA and CDC to agree within lookback window';

  private smaFast = 10;
  private smaSlow = 20;
  private cdcFast = 12;
  private cdcSlow = 26;
  private confirmationWindow = 3; // bars to look back for confirmation

  private recentSmaBuy = -999;
  private recentSmaSell = -999;
  private recentCdcBuy = -999;
  private recentCdcSell = -999;

  init(params: Record<string, any>): void {
    this.smaFast = params.smaFast || 10;
    this.smaSlow = params.smaSlow || 20;
    this.cdcFast = params.cdcFast || 12;
    this.cdcSlow = params.cdcSlow || 26;
    this.confirmationWindow = params.confirmationWindow || 3;
    this.recentSmaBuy = -999;
    this.recentSmaSell = -999;
    this.recentCdcBuy = -999;
    this.recentCdcSell = -999;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < Math.max(this.smaSlow, this.cdcSlow) + 1) return Signal.Hold;

    const price = candles[index].close;
    const prevPrice = candles[index - 1].close;

    // Check SMA signals
    const fastSMA = SMA(candles, this.smaFast, index);
    const slowSMA = SMA(candles, this.smaSlow, index);
    const prevFastSMA = SMA(candles, this.smaFast, index - 1);
    const prevSlowSMA = SMA(candles, this.smaSlow, index - 1);

    if (fastSMA && slowSMA && prevFastSMA && prevSlowSMA) {
      if (prevFastSMA <= prevSlowSMA && fastSMA > slowSMA) {
        this.recentSmaBuy = index;
      }
      if (prevFastSMA >= prevSlowSMA && fastSMA < slowSMA) {
        this.recentSmaSell = index;
      }
    }

    // Check CDC signals
    const fastEMA = EMA(candles, this.cdcFast, index);
    const slowEMA = EMA(candles, this.cdcSlow, index);
    const prevFastEMA = EMA(candles, this.cdcFast, index - 1);
    const prevSlowEMA = EMA(candles, this.cdcSlow, index - 1);

    if (fastEMA && slowEMA && prevFastEMA && prevSlowEMA) {
      const currentZone = getCDCZone(price, fastEMA, slowEMA);
      const prevZone = getCDCZone(prevPrice, prevFastEMA, prevSlowEMA);

      if (currentZone === CDCZone.Green && prevZone !== CDCZone.Green) {
        this.recentCdcBuy = index;
      }
      if (currentZone === CDCZone.Red && prevZone !== CDCZone.Red) {
        this.recentCdcSell = index;
      }
    }

    // Check for dual confirmation within window
    const smaBuyRecent = (index - this.recentSmaBuy) <= this.confirmationWindow;
    const cdcBuyRecent = (index - this.recentCdcBuy) <= this.confirmationWindow;
    const smaSellRecent = (index - this.recentSmaSell) <= this.confirmationWindow;
    const cdcSellRecent = (index - this.recentCdcSell) <= this.confirmationWindow;

    // Both must agree within the window
    if (smaBuyRecent && cdcBuyRecent) {
      // Reset to avoid duplicate signals
      this.recentSmaBuy = -999;
      this.recentCdcBuy = -999;
      return Signal.Buy;
    }

    if (smaSellRecent && cdcSellRecent) {
      this.recentSmaSell = -999;
      this.recentCdcSell = -999;
      return Signal.Sell;
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number | string | null> {
    return {
      recentSmaBuy: this.recentSmaBuy,
      recentCdcBuy: this.recentCdcBuy,
      recentSmaSell: this.recentSmaSell,
      recentCdcSell: this.recentCdcSell,
    };
  }
}

/**
 * HYBRID 4: SMA Entry / CDC Exit Strategy (Profit Focus)
 *
 * Logic:
 * - Uses SMA crossover for ENTRIES (faster, captures more moves)
 * - Uses CDC Red zone for EXITS (filtered, avoids premature exits)
 *
 * This aims to capture more upside while having smart exits.
 */
export class SMAEntryCDCExitStrategy implements IndicatorStrategy {
  name = 'SMA Entry / CDC Exit';
  description = 'Fast SMA entries with filtered CDC exits';

  private smaFast = 10;
  private smaSlow = 20;
  private cdcFast = 12;
  private cdcSlow = 26;
  private inPosition = false;

  init(params: Record<string, any>): void {
    this.smaFast = params.smaFast || 10;
    this.smaSlow = params.smaSlow || 20;
    this.cdcFast = params.cdcFast || 12;
    this.cdcSlow = params.cdcSlow || 26;
    this.inPosition = false;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < Math.max(this.smaSlow, this.cdcSlow) + 1) return Signal.Hold;

    const price = candles[index].close;
    const prevPrice = candles[index - 1].close;

    // SMA for entries
    const fastSMA = SMA(candles, this.smaFast, index);
    const slowSMA = SMA(candles, this.smaSlow, index);
    const prevFastSMA = SMA(candles, this.smaFast, index - 1);
    const prevSlowSMA = SMA(candles, this.smaSlow, index - 1);

    // CDC for exits
    const fastEMA = EMA(candles, this.cdcFast, index);
    const slowEMA = EMA(candles, this.cdcSlow, index);
    const prevFastEMA = EMA(candles, this.cdcFast, index - 1);
    const prevSlowEMA = EMA(candles, this.cdcSlow, index - 1);

    if (!fastSMA || !slowSMA || !prevFastSMA || !prevSlowSMA) return Signal.Hold;
    if (!fastEMA || !slowEMA || !prevFastEMA || !prevSlowEMA) return Signal.Hold;

    const currentZone = getCDCZone(price, fastEMA, slowEMA);
    const prevZone = getCDCZone(prevPrice, prevFastEMA, prevSlowEMA);

    // Entry: SMA bullish crossover
    if (!this.inPosition && prevFastSMA <= prevSlowSMA && fastSMA > slowSMA) {
      this.inPosition = true;
      return Signal.Buy;
    }

    // Exit: CDC enters Red zone (strong sell signal)
    if (this.inPosition && currentZone === CDCZone.Red && prevZone !== CDCZone.Red) {
      this.inPosition = false;
      return Signal.Sell;
    }

    // Fallback exit: SMA bearish crossover (if CDC doesn't trigger)
    if (this.inPosition && prevFastSMA >= prevSlowSMA && fastSMA < slowSMA) {
      this.inPosition = false;
      return Signal.Sell;
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number | string | null> {
    const fastSMA = SMA(candles, this.smaFast, index) || 0;
    const slowSMA = SMA(candles, this.smaSlow, index) || 0;
    const fastEMA = EMA(candles, this.cdcFast, index) || 0;
    const slowEMA = EMA(candles, this.cdcSlow, index) || 0;
    const zone = getCDCZone(candles[index].close, fastEMA, slowEMA);

    return { fastSMA, slowSMA, zone, inPosition: this.inPosition ? 1 : 0 };
  }
}

/**
 * HYBRID 5: CDC Entry / SMA Exit Strategy (Safety Focus)
 *
 * Logic:
 * - Uses CDC Green zone for ENTRIES (filtered, high quality)
 * - Uses SMA crossover for EXITS (faster, protects profits)
 *
 * This aims for high-quality entries with quick profit protection.
 */
export class CDCEntrySMAExitStrategy implements IndicatorStrategy {
  name = 'CDC Entry / SMA Exit';
  description = 'Filtered CDC entries with fast SMA exits';

  private smaFast = 10;
  private smaSlow = 20;
  private cdcFast = 12;
  private cdcSlow = 26;
  private inPosition = false;

  init(params: Record<string, any>): void {
    this.smaFast = params.smaFast || 10;
    this.smaSlow = params.smaSlow || 20;
    this.cdcFast = params.cdcFast || 12;
    this.cdcSlow = params.cdcSlow || 26;
    this.inPosition = false;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < Math.max(this.smaSlow, this.cdcSlow) + 1) return Signal.Hold;

    const price = candles[index].close;
    const prevPrice = candles[index - 1].close;

    // SMA for exits
    const fastSMA = SMA(candles, this.smaFast, index);
    const slowSMA = SMA(candles, this.smaSlow, index);
    const prevFastSMA = SMA(candles, this.smaFast, index - 1);
    const prevSlowSMA = SMA(candles, this.smaSlow, index - 1);

    // CDC for entries
    const fastEMA = EMA(candles, this.cdcFast, index);
    const slowEMA = EMA(candles, this.cdcSlow, index);
    const prevFastEMA = EMA(candles, this.cdcFast, index - 1);
    const prevSlowEMA = EMA(candles, this.cdcSlow, index - 1);

    if (!fastSMA || !slowSMA || !prevFastSMA || !prevSlowSMA) return Signal.Hold;
    if (!fastEMA || !slowEMA || !prevFastEMA || !prevSlowEMA) return Signal.Hold;

    const currentZone = getCDCZone(price, fastEMA, slowEMA);
    const prevZone = getCDCZone(prevPrice, prevFastEMA, prevSlowEMA);

    // Entry: CDC enters Green zone (strong buy signal)
    if (!this.inPosition && currentZone === CDCZone.Green && prevZone !== CDCZone.Green) {
      this.inPosition = true;
      return Signal.Buy;
    }

    // Exit: SMA bearish crossover (quick exit)
    if (this.inPosition && prevFastSMA >= prevSlowSMA && fastSMA < slowSMA) {
      this.inPosition = false;
      return Signal.Sell;
    }

    // Fallback exit: CDC enters Red zone
    if (this.inPosition && currentZone === CDCZone.Red && prevZone !== CDCZone.Red) {
      this.inPosition = false;
      return Signal.Sell;
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, number | string | null> {
    const fastSMA = SMA(candles, this.smaFast, index) || 0;
    const slowSMA = SMA(candles, this.smaSlow, index) || 0;
    const fastEMA = EMA(candles, this.cdcFast, index) || 0;
    const slowEMA = EMA(candles, this.cdcSlow, index) || 0;
    const zone = getCDCZone(candles[index].close, fastEMA, slowEMA);

    return { fastSMA, slowSMA, zone, inPosition: this.inPosition ? 1 : 0 };
  }
}

/**
 * Get hybrid strategy by name
 */
export function getHybridStrategy(name: string): IndicatorStrategy | null {
  const strategies: Record<string, IndicatorStrategy> = {
    'cdc-confirmed-sma': new CDCConfirmedSMAStrategy(),
    'volatility-adaptive': new VolatilityAdaptiveStrategy(),
    'dual-confirmation': new DualConfirmationStrategy(),
    'sma-entry-cdc-exit': new SMAEntryCDCExitStrategy(),
    'cdc-entry-sma-exit': new CDCEntrySMAExitStrategy(),
  };

  return strategies[name] || null;
}

/**
 * List hybrid strategies
 */
export function listHybridStrategies(): { name: string; description: string }[] {
  return [
    {
      name: 'cdc-confirmed-sma',
      description: 'SMA timing + CDC zone confirmation (balanced)',
    },
    {
      name: 'volatility-adaptive',
      description: 'Switches SMA/CDC based on market volatility (smart)',
    },
    {
      name: 'dual-confirmation',
      description: 'Requires both SMA and CDC to agree (safest)',
    },
    {
      name: 'sma-entry-cdc-exit',
      description: 'Fast SMA entries, filtered CDC exits (profit focus)',
    },
    {
      name: 'cdc-entry-sma-exit',
      description: 'Quality CDC entries, fast SMA exits (safety focus)',
    },
  ];
}
