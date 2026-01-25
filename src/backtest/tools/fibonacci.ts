import { Candle, IndicatorStrategy, Signal } from '../entities/candle';

/**
 * Fibonacci levels configuration
 */
export interface FibonacciLevels {
  retracements: number[];
  extensions: number[];
}

/**
 * Default Fibonacci levels (from piriya33's indicator)
 */
export const DEFAULT_FIB_LEVELS: FibonacciLevels = {
  retracements: [0.236, 0.382, 0.5, 0.618, 0.786, 0.887, 0.942],
  extensions: [0.618, 0.786, 1.0, 1.13, 1.272, 1.618, 2.618, 4.236],
};

/**
 * Swing point detection result
 */
export interface SwingPoint {
  index: number;
  price: number;
  timestamp: number;
  type: 'high' | 'low';
}

/**
 * Fibonacci analysis result
 */
export interface FibonacciAnalysis {
  swingHigh: SwingPoint;
  swingLow: SwingPoint;
  trend: 'uptrend' | 'downtrend';
  range: number;
  retracementLevels: { level: number; price: number }[];
  extensionLevels: { level: number; price: number }[];
  currentPrice: number;
  currentLevel: number; // Current price as Fib level (0 = low, 1 = high)
  nearestRetracement: { level: number; price: number; distance: number } | null;
  nearestExtension: { level: number; price: number; distance: number } | null;
}

/**
 * Risk/Reward analysis result
 */
export interface RiskRewardAnalysis {
  entryPrice: number;
  stopLoss: number;
  takeProfitLevels: { level: number; price: number; riskReward: number }[];
  riskAmount: number;
  riskPercent: number;
  fibAnalysis: FibonacciAnalysis;
}

/**
 * Fibonacci Retracement and Extension Tool
 * Based on piriya33's CDC Fibonacci indicator
 */
export class FibonacciTool {
  private levels: FibonacciLevels;
  private lookback: number;
  private useHighLow: boolean;

  constructor(
    levels: FibonacciLevels = DEFAULT_FIB_LEVELS,
    lookback: number = 50,
    useHighLow: boolean = true,
  ) {
    this.levels = levels;
    this.lookback = lookback;
    this.useHighLow = useHighLow;
  }

  /**
   * Find swing high in a range of candles
   */
  findSwingHigh(candles: Candle[], startIdx: number, endIdx: number): SwingPoint {
    let highestIdx = startIdx;
    let highestPrice = this.useHighLow ? candles[startIdx].high : candles[startIdx].close;

    for (let i = startIdx; i <= endIdx && i < candles.length; i++) {
      const price = this.useHighLow ? candles[i].high : candles[i].close;
      if (price > highestPrice) {
        highestPrice = price;
        highestIdx = i;
      }
    }

    return {
      index: highestIdx,
      price: highestPrice,
      timestamp: candles[highestIdx].timestamp,
      type: 'high',
    };
  }

  /**
   * Find swing low in a range of candles
   */
  findSwingLow(candles: Candle[], startIdx: number, endIdx: number): SwingPoint {
    let lowestIdx = startIdx;
    let lowestPrice = this.useHighLow ? candles[startIdx].low : candles[startIdx].close;

    for (let i = startIdx; i <= endIdx && i < candles.length; i++) {
      const price = this.useHighLow ? candles[i].low : candles[i].close;
      if (price < lowestPrice) {
        lowestPrice = price;
        lowestIdx = i;
      }
    }

    return {
      index: lowestIdx,
      price: lowestPrice,
      timestamp: candles[lowestIdx].timestamp,
      type: 'low',
    };
  }

  /**
   * Analyze Fibonacci levels for current market structure
   */
  analyze(candles: Candle[], index: number): FibonacciAnalysis | null {
    const startIdx = Math.max(0, index - this.lookback);
    if (startIdx >= index) return null;

    const swingHigh = this.findSwingHigh(candles, startIdx, index);
    const swingLow = this.findSwingLow(candles, startIdx, index);

    // Determine trend based on which swing came last
    const trend = swingHigh.index > swingLow.index ? 'uptrend' : 'downtrend';
    const range = swingHigh.price - swingLow.price;

    if (range <= 0) return null;

    const currentPrice = candles[index].close;

    // Calculate retracement levels
    const retracementLevels = this.levels.retracements.map((level) => ({
      level,
      price:
        trend === 'uptrend'
          ? swingHigh.price - range * level // Retracing from high
          : swingLow.price + range * level, // Retracing from low
    }));

    // Calculate extension levels (projections beyond the range)
    const extensionLevels = this.levels.extensions.map((level) => ({
      level,
      price:
        trend === 'uptrend'
          ? swingLow.price + range * level // Projecting above
          : swingHigh.price - range * level, // Projecting below
    }));

    // Calculate current price as Fib level
    const currentLevel = (currentPrice - swingLow.price) / range;

    // Find nearest retracement
    let nearestRetracement: { level: number; price: number; distance: number } | null = null;
    for (const ret of retracementLevels) {
      const distance = Math.abs(currentPrice - ret.price);
      if (!nearestRetracement || distance < nearestRetracement.distance) {
        nearestRetracement = { ...ret, distance };
      }
    }

    // Find nearest extension
    let nearestExtension: { level: number; price: number; distance: number } | null = null;
    for (const ext of extensionLevels) {
      const distance = Math.abs(currentPrice - ext.price);
      if (!nearestExtension || distance < nearestExtension.distance) {
        nearestExtension = { ...ext, distance };
      }
    }

    return {
      swingHigh,
      swingLow,
      trend,
      range,
      retracementLevels,
      extensionLevels,
      currentPrice,
      currentLevel,
      nearestRetracement,
      nearestExtension,
    };
  }

  /**
   * Calculate Risk/Reward ratios for a potential trade
   */
  calculateRiskReward(
    candles: Candle[],
    index: number,
    entryPrice?: number,
    stopLossLevel: number = 0, // 0 = swing low/high
  ): RiskRewardAnalysis | null {
    const fibAnalysis = this.analyze(candles, index);
    if (!fibAnalysis) return null;

    const entry = entryPrice || fibAnalysis.currentPrice;

    // Set stop loss at swing low (for longs) or swing high (for shorts)
    let stopLoss: number;
    if (stopLossLevel === 0) {
      stopLoss =
        fibAnalysis.trend === 'uptrend'
          ? fibAnalysis.swingLow.price
          : fibAnalysis.swingHigh.price;
    } else {
      // Use specified Fib level as stop
      const stopFib = fibAnalysis.retracementLevels.find((r) => r.level === stopLossLevel);
      stopLoss = stopFib?.price || fibAnalysis.swingLow.price;
    }

    const riskAmount = Math.abs(entry - stopLoss);
    const riskPercent = (riskAmount / entry) * 100;

    // Calculate take profit levels with R:R
    const takeProfitLevels = fibAnalysis.extensionLevels.map((ext) => ({
      level: ext.level,
      price: ext.price,
      riskReward: Math.abs(ext.price - entry) / riskAmount,
    }));

    return {
      entryPrice: entry,
      stopLoss,
      takeProfitLevels,
      riskAmount,
      riskPercent,
      fibAnalysis,
    };
  }

  /**
   * Check if price is at a Fibonacci level (within tolerance)
   */
  isAtFibLevel(
    candles: Candle[],
    index: number,
    tolerance: number = 0.01, // 1% tolerance
  ): { atRetracement: number | null; atExtension: number | null } {
    const analysis = this.analyze(candles, index);
    if (!analysis) return { atRetracement: null, atExtension: null };

    const price = analysis.currentPrice;

    // Check retracements
    let atRetracement: number | null = null;
    for (const ret of analysis.retracementLevels) {
      const diff = Math.abs(price - ret.price) / ret.price;
      if (diff <= tolerance) {
        atRetracement = ret.level;
        break;
      }
    }

    // Check extensions
    let atExtension: number | null = null;
    for (const ext of analysis.extensionLevels) {
      const diff = Math.abs(price - ext.price) / ext.price;
      if (diff <= tolerance) {
        atExtension = ext.level;
        break;
      }
    }

    return { atRetracement, atExtension };
  }

  /**
   * Format analysis as a readable report
   */
  formatReport(analysis: FibonacciAnalysis | null, riskReward?: RiskRewardAnalysis): string {
    if (!analysis) return 'Insufficient data for Fibonacci analysis';

    let report = `
╔══════════════════════════════════════════════════════════════╗
║                   FIBONACCI ANALYSIS                          ║
╠══════════════════════════════════════════════════════════════╣
║ Trend: ${analysis.trend.toUpperCase().padEnd(52)} ║
║ Range: $${analysis.range.toFixed(2).padStart(15)}                             ║
╠══════════════════════════════════════════════════════════════╣
║ Swing High: $${analysis.swingHigh.price.toFixed(2).padStart(12)} (idx: ${String(analysis.swingHigh.index).padStart(4)})              ║
║ Swing Low:  $${analysis.swingLow.price.toFixed(2).padStart(12)} (idx: ${String(analysis.swingLow.index).padStart(4)})              ║
╠══════════════════════════════════════════════════════════════╣
║ Current Price: $${analysis.currentPrice.toFixed(2).padStart(12)}                          ║
║ Current Level: ${(analysis.currentLevel * 100).toFixed(1).padStart(6)}%                               ║
╠══════════════════════════════════════════════════════════════╣
║ RETRACEMENT LEVELS                                            ║
╠══════════════════════════════════════════════════════════════╣`;

    for (const ret of analysis.retracementLevels) {
      report += `\n║ ${(ret.level * 100).toFixed(1).padStart(6)}%: $${ret.price.toFixed(2).padStart(15)}                              ║`;
    }

    report += `
╠══════════════════════════════════════════════════════════════╣
║ EXTENSION LEVELS                                              ║
╠══════════════════════════════════════════════════════════════╣`;

    for (const ext of analysis.extensionLevels) {
      report += `\n║ ${(ext.level * 100).toFixed(1).padStart(6)}%: $${ext.price.toFixed(2).padStart(15)}                              ║`;
    }

    if (riskReward) {
      report += `
╠══════════════════════════════════════════════════════════════╣
║ RISK/REWARD ANALYSIS                                          ║
╠══════════════════════════════════════════════════════════════╣
║ Entry:     $${riskReward.entryPrice.toFixed(2).padStart(15)}                          ║
║ Stop Loss: $${riskReward.stopLoss.toFixed(2).padStart(15)}                          ║
║ Risk:      $${riskReward.riskAmount.toFixed(2).padStart(15)} (${riskReward.riskPercent.toFixed(2)}%)         ║
╠══════════════════════════════════════════════════════════════╣
║ TAKE PROFIT TARGETS                                           ║
╠══════════════════════════════════════════════════════════════╣`;

      for (const tp of riskReward.takeProfitLevels) {
        report += `\n║ ${(tp.level * 100).toFixed(1).padStart(6)}%: $${tp.price.toFixed(2).padStart(12)} (R:R = ${tp.riskReward.toFixed(2).padStart(5)})           ║`;
      }
    }

    report += '\n╚══════════════════════════════════════════════════════════════╝';

    return report;
  }
}

/**
 * Fibonacci Retracement Strategy
 * Buys at key retracement levels in an uptrend
 * Sells at extension targets
 */
export class FibonacciRetracementStrategy implements IndicatorStrategy {
  name = 'Fibonacci Retracement';
  description = 'Buy at Fib retracement levels, sell at extension targets';

  private fibTool: FibonacciTool;
  private buyLevels = [0.618, 0.786]; // Golden ratio retracements
  private sellLevel = 1.618; // Golden ratio extension
  private tolerance = 0.015; // 1.5% tolerance
  private inPosition = false;
  private entryPrice: number | null = null;

  init(params: Record<string, any>): void {
    this.buyLevels = params.buyLevels || [0.618, 0.786];
    this.sellLevel = params.sellLevel || 1.618;
    this.tolerance = params.tolerance || 0.015;
    const lookback = params.lookback || 50;
    this.fibTool = new FibonacciTool(DEFAULT_FIB_LEVELS, lookback);
    this.inPosition = false;
    this.entryPrice = null;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (index < 10) return Signal.Hold;

    const analysis = this.fibTool.analyze(candles, index);
    if (!analysis || analysis.trend !== 'uptrend') return Signal.Hold;

    const price = candles[index].close;

    // Check for buy at retracement levels
    if (!this.inPosition) {
      for (const ret of analysis.retracementLevels) {
        if (this.buyLevels.includes(ret.level)) {
          const diff = Math.abs(price - ret.price) / ret.price;
          if (diff <= this.tolerance) {
            this.inPosition = true;
            this.entryPrice = price;
            return Signal.Buy;
          }
        }
      }
    }

    // Check for sell at extension target
    if (this.inPosition && this.entryPrice) {
      const targetExt = analysis.extensionLevels.find((e) => e.level >= this.sellLevel);
      if (targetExt && price >= targetExt.price) {
        this.inPosition = false;
        this.entryPrice = null;
        return Signal.Sell;
      }

      // Stop loss at swing low
      if (price < analysis.swingLow.price) {
        this.inPosition = false;
        this.entryPrice = null;
        return Signal.Sell;
      }
    }

    return Signal.Hold;
  }

  getIndicatorValues(candles: Candle[], index: number): Record<string, any> {
    const analysis = this.fibTool.analyze(candles, index);
    return {
      trend: analysis?.trend || 'unknown',
      currentLevel: analysis?.currentLevel || 0,
      nearestRetracement: analysis?.nearestRetracement?.level || null,
      nearestExtension: analysis?.nearestExtension?.level || null,
      inPosition: this.inPosition ? 1 : 0,
    };
  }
}

/**
 * Quick analysis function
 */
export function analyzeFibonacci(
  candles: Candle[],
  lookback: number = 50,
): { analysis: FibonacciAnalysis | null; riskReward: RiskRewardAnalysis | null; report: string } {
  const tool = new FibonacciTool(DEFAULT_FIB_LEVELS, lookback);
  const index = candles.length - 1;
  const analysis = tool.analyze(candles, index);
  const riskReward = tool.calculateRiskReward(candles, index);
  const report = tool.formatReport(analysis, riskReward || undefined);

  return { analysis, riskReward, report };
}
