/**
 * Comprehensive Strategy Comparison Script
 * Compares all strategies on BTCUSDT from 2020-2025
 * Generates all-time, yearly, and quarterly rankings
 */

import { CandleService } from './services/candle.service';
import { BacktestService } from './services/backtest.service';
import { getStrategy, listStrategies } from './strategies/sample-strategies';
import { Candle, BacktestConfig, BacktestMetrics } from './entities/candle';
import { HttpService } from '@nestjs/common';

// Time periods
const PERIODS = {
  'ALL_TIME': { start: new Date('2020-01-01'), end: new Date('2025-01-25') },
  '2020': { start: new Date('2020-01-01'), end: new Date('2020-12-31') },
  '2021': { start: new Date('2021-01-01'), end: new Date('2021-12-31') },
  '2022': { start: new Date('2022-01-01'), end: new Date('2022-12-31') },
  '2023': { start: new Date('2023-01-01'), end: new Date('2023-12-31') },
  '2024': { start: new Date('2024-01-01'), end: new Date('2024-12-31') },
  '2025': { start: new Date('2025-01-01'), end: new Date('2025-01-25') },
  // Quarters
  '2020-Q1': { start: new Date('2020-01-01'), end: new Date('2020-03-31') },
  '2020-Q2': { start: new Date('2020-04-01'), end: new Date('2020-06-30') },
  '2020-Q3': { start: new Date('2020-07-01'), end: new Date('2020-09-30') },
  '2020-Q4': { start: new Date('2020-10-01'), end: new Date('2020-12-31') },
  '2021-Q1': { start: new Date('2021-01-01'), end: new Date('2021-03-31') },
  '2021-Q2': { start: new Date('2021-04-01'), end: new Date('2021-06-30') },
  '2021-Q3': { start: new Date('2021-07-01'), end: new Date('2021-09-30') },
  '2021-Q4': { start: new Date('2021-10-01'), end: new Date('2021-12-31') },
  '2022-Q1': { start: new Date('2022-01-01'), end: new Date('2022-03-31') },
  '2022-Q2': { start: new Date('2022-04-01'), end: new Date('2022-06-30') },
  '2022-Q3': { start: new Date('2022-07-01'), end: new Date('2022-09-30') },
  '2022-Q4': { start: new Date('2022-10-01'), end: new Date('2022-12-31') },
  '2023-Q1': { start: new Date('2023-01-01'), end: new Date('2023-03-31') },
  '2023-Q2': { start: new Date('2023-04-01'), end: new Date('2023-06-30') },
  '2023-Q3': { start: new Date('2023-07-01'), end: new Date('2023-09-30') },
  '2023-Q4': { start: new Date('2023-10-01'), end: new Date('2023-12-31') },
  '2024-Q1': { start: new Date('2024-01-01'), end: new Date('2024-03-31') },
  '2024-Q2': { start: new Date('2024-04-01'), end: new Date('2024-06-30') },
  '2024-Q3': { start: new Date('2024-07-01'), end: new Date('2024-09-30') },
  '2024-Q4': { start: new Date('2024-10-01'), end: new Date('2024-12-31') },
};

interface StrategyResult {
  strategy: string;
  period: string;
  totalPnl: number;
  totalPnlPercent: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
}

interface RankEntry {
  strategy: string;
  score: number;
  avgRank: number;
  ranks: { period: string; rank: number }[];
}

async function fetchAllCandles(): Promise<Candle[]> {
  console.log('Fetching BTCUSDT daily candles from 2020-01-01 to 2025-01-25...');

  const baseURL = 'https://api.binance.com';
  const allCandles: Candle[] = [];
  let startTime = new Date('2020-01-01').getTime();
  const endTime = new Date('2025-01-25').getTime();

  while (startTime < endTime) {
    const url = `${baseURL}/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${startTime}&endTime=${endTime}&limit=1000`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) break;

      for (const kline of data) {
        allCandles.push({
          timestamp: kline[0],
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
          volume: parseFloat(kline[5]),
        });
      }

      startTime = data[data.length - 1][0] + 1;

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('Error fetching candles:', error);
      break;
    }
  }

  console.log(`Fetched ${allCandles.length} candles`);
  return allCandles;
}

function filterCandlesByPeriod(candles: Candle[], start: Date, end: Date): Candle[] {
  const startTime = start.getTime();
  const endTime = end.getTime();
  return candles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
}

function runBacktest(
  candles: Candle[],
  strategyName: string,
  period: string,
): StrategyResult | null {
  if (candles.length < 60) {
    return null;
  }

  const strategy = getStrategy(strategyName);
  if (!strategy) return null;

  // Reset strategy state
  if (strategy.init) {
    strategy.init({});
  }

  const backtestService = new BacktestService();
  const config: BacktestConfig = {
    symbol: 'BTCUSDT',
    timeframe: '1d',
    initialCapital: 10000,
    positionSizePercent: 95,
    commission: 0.001,
    slippage: 0.0005,
  };

  try {
    const result = backtestService.runBacktest(candles, strategy, config);
    return {
      strategy: strategyName,
      period,
      totalPnl: result.metrics.totalPnl,
      totalPnlPercent: result.metrics.totalPnlPercent,
      totalTrades: result.metrics.totalTrades,
      winRate: result.metrics.winRate,
      profitFactor: result.metrics.profitFactor,
      maxDrawdownPercent: result.metrics.maxDrawdownPercent,
      sharpeRatio: result.metrics.sharpeRatio,
    };
  } catch (error) {
    return null;
  }
}

function calculateStackedRanks(results: StrategyResult[]): RankEntry[] {
  const strategies = [...new Set(results.map(r => r.strategy))];
  const periods = [...new Set(results.map(r => r.period))];

  const rankEntries: RankEntry[] = strategies.map(s => ({
    strategy: s,
    score: 0,
    avgRank: 0,
    ranks: [],
  }));

  // For each period, rank strategies by PnL%
  for (const period of periods) {
    const periodResults = results
      .filter(r => r.period === period)
      .sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);

    periodResults.forEach((result, index) => {
      const rank = index + 1;
      const entry = rankEntries.find(e => e.strategy === result.strategy);
      if (entry) {
        entry.ranks.push({ period, rank });
        entry.score += (strategies.length - rank + 1); // Higher score for better rank
      }
    });
  }

  // Calculate average rank
  rankEntries.forEach(entry => {
    if (entry.ranks.length > 0) {
      entry.avgRank = entry.ranks.reduce((sum, r) => sum + r.rank, 0) / entry.ranks.length;
    }
  });

  // Sort by score (descending)
  return rankEntries.sort((a, b) => b.score - a.score);
}

function formatTable(headers: string[], rows: string[][], title: string): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] || '').length))
  );

  const separator = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+';
  const headerRow = '|' + headers.map((h, i) => ` ${h.padEnd(colWidths[i])} `).join('|') + '|';

  let output = `\n${title}\n${separator}\n${headerRow}\n${separator}\n`;

  for (const row of rows) {
    const rowStr = '|' + row.map((cell, i) => ` ${(cell || '').padEnd(colWidths[i])} `).join('|') + '|';
    output += rowStr + '\n';
  }

  output += separator;
  return output;
}

async function main() {
  console.log('='.repeat(80));
  console.log('BTCUSDT STRATEGY COMPARISON: 2020-2025');
  console.log('='.repeat(80));

  // Fetch all candles
  const allCandles = await fetchAllCandles();

  if (allCandles.length === 0) {
    console.error('Failed to fetch candle data');
    return;
  }

  // Get all strategy names
  const strategyNames = listStrategies().map(s => s.name);
  console.log(`\nTesting ${strategyNames.length} strategies across ${Object.keys(PERIODS).length} periods...\n`);

  const allResults: StrategyResult[] = [];

  // Run backtests for each period
  for (const [periodName, period] of Object.entries(PERIODS)) {
    const periodCandles = filterCandlesByPeriod(allCandles, period.start, period.end);
    console.log(`\n${periodName}: ${periodCandles.length} candles`);

    for (const strategyName of strategyNames) {
      const result = runBacktest(periodCandles, strategyName, periodName);
      if (result) {
        allResults.push(result);
        process.stdout.write('.');
      }
    }
  }

  console.log('\n');

  // ============ ALL-TIME RESULTS ============
  const allTimeResults = allResults
    .filter(r => r.period === 'ALL_TIME')
    .sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);

  console.log(formatTable(
    ['Rank', 'Strategy', 'PnL%', 'Trades', 'Win%', 'PF', 'MaxDD%', 'Sharpe'],
    allTimeResults.map((r, i) => [
      String(i + 1),
      r.strategy,
      r.totalPnlPercent.toFixed(2) + '%',
      String(r.totalTrades),
      r.winRate.toFixed(1) + '%',
      r.profitFactor === Infinity ? '∞' : r.profitFactor.toFixed(2),
      r.maxDrawdownPercent.toFixed(2) + '%',
      r.sharpeRatio.toFixed(2),
    ]),
    '═══════════════════ ALL-TIME RESULTS (2020-2025) ═══════════════════'
  ));

  // ============ YEARLY RESULTS ============
  const years = ['2020', '2021', '2022', '2023', '2024', '2025'];

  for (const year of years) {
    const yearResults = allResults
      .filter(r => r.period === year)
      .sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);

    if (yearResults.length > 0) {
      console.log(formatTable(
        ['Rank', 'Strategy', 'PnL%', 'Trades', 'Win%', 'PF', 'MaxDD%'],
        yearResults.map((r, i) => [
          String(i + 1),
          r.strategy,
          r.totalPnlPercent.toFixed(2) + '%',
          String(r.totalTrades),
          r.winRate.toFixed(1) + '%',
          r.profitFactor === Infinity ? '∞' : r.profitFactor.toFixed(2),
          r.maxDrawdownPercent.toFixed(2) + '%',
        ]),
        `═══════════════════ ${year} RESULTS ═══════════════════`
      ));
    }
  }

  // ============ QUARTERLY RESULTS SUMMARY ============
  const quarters = Object.keys(PERIODS).filter(p => p.includes('-Q'));

  // Create quarterly summary table
  const quarterlyRows: string[][] = [];
  for (const strat of strategyNames) {
    const row = [strat];
    for (const q of quarters) {
      const result = allResults.find(r => r.strategy === strat && r.period === q);
      row.push(result ? `${result.totalPnlPercent.toFixed(1)}%` : 'N/A');
    }
    quarterlyRows.push(row);
  }

  // Sort by total performance
  quarterlyRows.sort((a, b) => {
    const sumA = a.slice(1).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
    const sumB = b.slice(1).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
    return sumB - sumA;
  });

  console.log(formatTable(
    ['Strategy', ...quarters],
    quarterlyRows,
    '═══════════════════ QUARTERLY PnL% SUMMARY ═══════════════════'
  ));

  // ============ STACKED RANKINGS ============
  const yearlyResults = allResults.filter(r => years.includes(r.period));
  const stackedRanks = calculateStackedRanks(yearlyResults);

  console.log(formatTable(
    ['Rank', 'Strategy', 'Score', 'Avg Rank', '2020', '2021', '2022', '2023', '2024', '2025'],
    stackedRanks.map((entry, i) => {
      const yearRanks = years.map(y => {
        const rank = entry.ranks.find(r => r.period === y);
        return rank ? `#${rank.rank}` : '-';
      });
      return [
        String(i + 1),
        entry.strategy,
        String(entry.score),
        entry.avgRank.toFixed(2),
        ...yearRanks,
      ];
    }),
    '═══════════════════ STACKED RANKINGS (BY YEAR) ═══════════════════'
  ));

  // Quarterly stacked ranks
  const quarterlyStackedRanks = calculateStackedRanks(
    allResults.filter(r => r.period.includes('-Q'))
  );

  console.log(formatTable(
    ['Rank', 'Strategy', 'Score', 'Avg Rank', 'Best Quarter', 'Worst Quarter'],
    quarterlyStackedRanks.map((entry, i) => {
      const bestQ = entry.ranks.reduce((best, r) => r.rank < best.rank ? r : best, { period: '-', rank: 999 });
      const worstQ = entry.ranks.reduce((worst, r) => r.rank > worst.rank ? r : worst, { period: '-', rank: 0 });
      return [
        String(i + 1),
        entry.strategy,
        String(entry.score),
        entry.avgRank.toFixed(2),
        `${bestQ.period} (#${bestQ.rank})`,
        `${worstQ.period} (#${worstQ.rank})`,
      ];
    }),
    '═══════════════════ STACKED RANKINGS (BY QUARTER) ═══════════════════'
  ));

  // ============ CONSISTENCY ANALYSIS ============
  console.log('\n═══════════════════ CONSISTENCY ANALYSIS ═══════════════════');

  for (const strat of strategyNames) {
    const stratResults = allResults.filter(r => r.strategy === strat && years.includes(r.period));
    const positiveYears = stratResults.filter(r => r.totalPnlPercent > 0).length;
    const totalYears = stratResults.length;
    const avgPnl = stratResults.reduce((sum, r) => sum + r.totalPnlPercent, 0) / totalYears;
    const stdDev = Math.sqrt(
      stratResults.reduce((sum, r) => sum + Math.pow(r.totalPnlPercent - avgPnl, 2), 0) / totalYears
    );

    console.log(`${strat.padEnd(25)} | Profitable: ${positiveYears}/${totalYears} years | Avg: ${avgPnl.toFixed(1)}% | StdDev: ${stdDev.toFixed(1)}%`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('Analysis complete!');
}

main().catch(console.error);
