import { Injectable } from '@nestjs/common';
import {
  Candle,
  Signal,
  Trade,
  BacktestConfig,
  BacktestResult,
  BacktestMetrics,
  IndicatorStrategy,
} from '../entities/candle';

/**
 * Backtesting engine that simulates trading strategies on historical data
 */
@Injectable()
export class BacktestService {
  /**
   * Run a backtest with the given strategy and candle data
   */
  runBacktest(
    candles: Candle[],
    strategy: IndicatorStrategy,
    config: BacktestConfig,
  ): BacktestResult {
    if (candles.length < 2) {
      throw new Error('Insufficient candle data for backtesting');
    }

    const trades: Trade[] = [];
    const equityCurve: { timestamp: number; equity: number }[] = [];
    let capital = config.initialCapital;
    let position: Trade | null = null;

    // Iterate through candles
    for (let i = 1; i < candles.length; i++) {
      const currentCandle = candles[i];
      const signal = strategy.calculate(candles, i);

      // Handle existing position
      if (position) {
        if (signal === Signal.Sell || i === candles.length - 1) {
          // Close position
          const exitPrice = this.applySlippage(currentCandle.close, config.slippage, 'sell');
          const grossPnl = (exitPrice - position.entryPrice) * position.size;
          const commission = exitPrice * position.size * config.commission;
          const netPnl = grossPnl - commission;

          position.exitTime = currentCandle.timestamp;
          position.exitPrice = exitPrice;
          position.pnl = netPnl;
          position.pnlPercent = (netPnl / (position.entryPrice * position.size)) * 100;

          capital += position.entryPrice * position.size + netPnl;
          trades.push({ ...position });
          position = null;
        }
      } else {
        // No position - check for buy signal
        if (signal === Signal.Buy) {
          const entryPrice = this.applySlippage(currentCandle.close, config.slippage, 'buy');
          const positionValue = capital * (config.positionSizePercent / 100);
          const commission = positionValue * config.commission;
          const size = (positionValue - commission) / entryPrice;

          if (size > 0 && positionValue <= capital) {
            position = {
              entryTime: currentCandle.timestamp,
              entryPrice,
              side: 'long',
              size,
            };
            capital -= positionValue;
          }
        }
      }

      // Record equity
      const currentEquity = position
        ? capital + position.size * currentCandle.close
        : capital;
      equityCurve.push({
        timestamp: currentCandle.timestamp,
        equity: currentEquity,
      });
    }

    const metrics = this.calculateMetrics(trades, config.initialCapital, equityCurve);

    return {
      config,
      trades,
      metrics,
      equityCurve,
    };
  }

  /**
   * Apply slippage to price
   */
  private applySlippage(price: number, slippage: number, side: 'buy' | 'sell'): number {
    const slippageAmount = price * slippage;
    return side === 'buy' ? price + slippageAmount : price - slippageAmount;
  }

  /**
   * Calculate performance metrics from trades
   */
  private calculateMetrics(
    trades: Trade[],
    initialCapital: number,
    equityCurve: { timestamp: number; equity: number }[],
  ): BacktestMetrics {
    if (trades.length === 0) {
      return this.getEmptyMetrics();
    }

    const completedTrades = trades.filter((t) => t.pnl !== undefined);
    const winningTrades = completedTrades.filter((t) => t.pnl! > 0);
    const losingTrades = completedTrades.filter((t) => t.pnl! <= 0);

    const totalPnl = completedTrades.reduce((sum, t) => sum + t.pnl!, 0);
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl!, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl!, 0));

    const avgWin = winningTrades.length > 0
      ? grossProfit / winningTrades.length
      : 0;
    const avgLoss = losingTrades.length > 0
      ? grossLoss / losingTrades.length
      : 0;

    const { maxDrawdown, maxDrawdownPercent } = this.calculateDrawdown(equityCurve);

    const returns = this.calculateReturns(equityCurve);
    const sharpeRatio = this.calculateSharpeRatio(returns);
    const sortinoRatio = this.calculateSortinoRatio(returns);

    const avgHoldingPeriod = completedTrades.length > 0
      ? completedTrades.reduce((sum, t) => sum + (t.exitTime! - t.entryTime), 0) /
        completedTrades.length
      : 0;

    return {
      totalTrades: completedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: completedTrades.length > 0
        ? (winningTrades.length / completedTrades.length) * 100
        : 0,
      totalPnl,
      totalPnlPercent: (totalPnl / initialCapital) * 100,
      averageWin: avgWin,
      averageLoss: avgLoss,
      largestWin: winningTrades.length > 0
        ? Math.max(...winningTrades.map((t) => t.pnl!))
        : 0,
      largestLoss: losingTrades.length > 0
        ? Math.min(...losingTrades.map((t) => t.pnl!))
        : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      maxDrawdown,
      maxDrawdownPercent,
      sharpeRatio,
      sortinoRatio,
      averageHoldingPeriod: avgHoldingPeriod,
    };
  }

  /**
   * Calculate maximum drawdown from equity curve
   */
  private calculateDrawdown(
    equityCurve: { timestamp: number; equity: number }[],
  ): { maxDrawdown: number; maxDrawdownPercent: number } {
    let peak = equityCurve[0]?.equity || 0;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;

    for (const point of equityCurve) {
      if (point.equity > peak) {
        peak = point.equity;
      }
      const drawdown = peak - point.equity;
      const drawdownPercent = (drawdown / peak) * 100;

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPercent;
      }
    }

    return { maxDrawdown, maxDrawdownPercent };
  }

  /**
   * Calculate period returns from equity curve
   */
  private calculateReturns(equityCurve: { timestamp: number; equity: number }[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const ret = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
      returns.push(ret);
    }
    return returns;
  }

  /**
   * Calculate Sharpe Ratio (assuming risk-free rate of 0)
   */
  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualize (assuming daily returns, 252 trading days)
    return (mean / stdDev) * Math.sqrt(252);
  }

  /**
   * Calculate Sortino Ratio (only considers downside volatility)
   */
  private calculateSortinoRatio(returns: number[]): number {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const negativeReturns = returns.filter((r) => r < 0);

    if (negativeReturns.length === 0) return mean > 0 ? Infinity : 0;

    const downsideVariance =
      negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length;
    const downsideStdDev = Math.sqrt(downsideVariance);

    if (downsideStdDev === 0) return 0;

    // Annualize
    return (mean / downsideStdDev) * Math.sqrt(252);
  }

  /**
   * Get empty metrics for no-trade scenarios
   */
  private getEmptyMetrics(): BacktestMetrics {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      averageWin: 0,
      averageLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      averageHoldingPeriod: 0,
    };
  }

  /**
   * Format backtest results as a summary string
   */
  formatResults(result: BacktestResult): string {
    const m = result.metrics;
    const duration = result.equityCurve.length > 0
      ? (result.equityCurve[result.equityCurve.length - 1].timestamp -
          result.equityCurve[0].timestamp) /
        (24 * 60 * 60 * 1000)
      : 0;

    return `
╔══════════════════════════════════════════════════════════╗
║                    BACKTEST RESULTS                       ║
╠══════════════════════════════════════════════════════════╣
║ Symbol: ${result.config.symbol.padEnd(20)} Timeframe: ${result.config.timeframe.padEnd(10)} ║
║ Period: ${duration.toFixed(0)} days                                         ║
╠══════════════════════════════════════════════════════════╣
║ PERFORMANCE                                               ║
╠══════════════════════════════════════════════════════════╣
║ Initial Capital:    $${result.config.initialCapital.toFixed(2).padStart(15)}              ║
║ Final Capital:      $${(result.config.initialCapital + m.totalPnl).toFixed(2).padStart(15)}              ║
║ Total P&L:          $${m.totalPnl.toFixed(2).padStart(15)} (${m.totalPnlPercent.toFixed(2)}%)      ║
╠══════════════════════════════════════════════════════════╣
║ TRADES                                                    ║
╠══════════════════════════════════════════════════════════╣
║ Total Trades:       ${m.totalTrades.toString().padStart(10)}                          ║
║ Winning Trades:     ${m.winningTrades.toString().padStart(10)}                          ║
║ Losing Trades:      ${m.losingTrades.toString().padStart(10)}                          ║
║ Win Rate:           ${m.winRate.toFixed(2).padStart(10)}%                         ║
╠══════════════════════════════════════════════════════════╣
║ RISK METRICS                                              ║
╠══════════════════════════════════════════════════════════╣
║ Max Drawdown:       $${m.maxDrawdown.toFixed(2).padStart(15)} (${m.maxDrawdownPercent.toFixed(2)}%)    ║
║ Profit Factor:      ${m.profitFactor === Infinity ? '∞'.padStart(10) : m.profitFactor.toFixed(2).padStart(10)}                          ║
║ Sharpe Ratio:       ${m.sharpeRatio.toFixed(2).padStart(10)}                          ║
║ Sortino Ratio:      ${m.sortinoRatio === Infinity ? '∞'.padStart(10) : m.sortinoRatio.toFixed(2).padStart(10)}                          ║
╠══════════════════════════════════════════════════════════╣
║ AVERAGE TRADE                                             ║
╠══════════════════════════════════════════════════════════╣
║ Average Win:        $${m.averageWin.toFixed(2).padStart(15)}              ║
║ Average Loss:       $${m.averageLoss.toFixed(2).padStart(15)}              ║
║ Largest Win:        $${m.largestWin.toFixed(2).padStart(15)}              ║
║ Largest Loss:       $${m.largestLoss.toFixed(2).padStart(15)}              ║
╚══════════════════════════════════════════════════════════╝
    `.trim();
  }
}
