/**
 * Comprehensive Strategy Comparison Script
 * Compares all strategies on BTCUSDT from 2020-2025
 * Run with: npx ts-node run-comparison.ts
 */

import { BacktestService } from './src/backtest/services/backtest.service';
import { getStrategy, listStrategies } from './src/backtest/strategies/sample-strategies';
import { Candle, BacktestConfig } from './src/backtest/entities/candle';

// Time periods
const PERIODS: Record<string, { start: Date; end: Date }> = {
  'ALL_TIME': { start: new Date('2020-01-01'), end: new Date('2025-01-25') },
  '2020': { start: new Date('2020-01-01'), end: new Date('2020-12-31') },
  '2021': { start: new Date('2021-01-01'), end: new Date('2021-12-31') },
  '2022': { start: new Date('2022-01-01'), end: new Date('2022-12-31') },
  '2023': { start: new Date('2023-01-01'), end: new Date('2023-12-31') },
  '2024': { start: new Date('2024-01-01'), end: new Date('2024-12-31') },
  '2025': { start: new Date('2025-01-01'), end: new Date('2025-01-25') },
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
      process.stdout.write(`\rFetched ${allCandles.length} candles...`);

      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('Error fetching candles:', error);
      break;
    }
  }

  console.log(`\nTotal: ${allCandles.length} candles\n`);
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
  if (candles.length < 60) return null;

  const strategy = getStrategy(strategyName);
  if (!strategy) return null;

  if (strategy.init) strategy.init({});

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
  } catch {
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

  for (const period of periods) {
    const periodResults = results
      .filter(r => r.period === period)
      .sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);

    periodResults.forEach((result, index) => {
      const rank = index + 1;
      const entry = rankEntries.find(e => e.strategy === result.strategy);
      if (entry) {
        entry.ranks.push({ period, rank });
        entry.score += (strategies.length - rank + 1);
      }
    });
  }

  rankEntries.forEach(entry => {
    if (entry.ranks.length > 0) {
      entry.avgRank = entry.ranks.reduce((sum, r) => sum + r.rank, 0) / entry.ranks.length;
    }
  });

  return rankEntries.sort((a, b) => b.score - a.score);
}

function printTable(title: string, headers: string[], rows: string[][]) {
  console.log(`\n${'═'.repeat(100)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(100));

  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i] || '').length)) + 2
  );

  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join('│');
  console.log(headerLine);
  console.log('─'.repeat(colWidths.reduce((a, b) => a + b + 1, 0)));

  for (const row of rows) {
    const line = row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join('│');
    console.log(line);
  }
}

async function main() {
  console.log('═'.repeat(100));
  console.log('  BTCUSDT STRATEGY COMPARISON: 2020-2025');
  console.log('  Initial Capital: $10,000 | Commission: 0.1% | Slippage: 0.05%');
  console.log('═'.repeat(100));

  const allCandles = await fetchAllCandles();
  if (allCandles.length === 0) {
    console.error('Failed to fetch candle data');
    return;
  }

  const strategyNames = listStrategies().map(s => s.name);
  console.log(`Testing ${strategyNames.length} strategies across ${Object.keys(PERIODS).length} periods...\n`);

  const allResults: StrategyResult[] = [];

  for (const [periodName, period] of Object.entries(PERIODS)) {
    const periodCandles = filterCandlesByPeriod(allCandles, period.start, period.end);
    process.stdout.write(`${periodName.padEnd(12)}: `);

    for (const strategyName of strategyNames) {
      const result = runBacktest(periodCandles, strategyName, periodName);
      if (result) {
        allResults.push(result);
        process.stdout.write('█');
      } else {
        process.stdout.write('░');
      }
    }
    console.log(` (${periodCandles.length} candles)`);
  }

  // ============ ALL-TIME RESULTS ============
  const allTimeResults = allResults
    .filter(r => r.period === 'ALL_TIME')
    .sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);

  printTable(
    'ALL-TIME RESULTS (2020-2025)',
    ['#', 'Strategy', 'PnL $', 'PnL %', 'Trades', 'Win%', 'PF', 'MaxDD%', 'Sharpe'],
    allTimeResults.map((r, i) => [
      String(i + 1),
      r.strategy,
      '$' + r.totalPnl.toFixed(0),
      r.totalPnlPercent.toFixed(1) + '%',
      String(r.totalTrades),
      r.winRate.toFixed(1) + '%',
      r.profitFactor === Infinity ? '∞' : r.profitFactor.toFixed(2),
      r.maxDrawdownPercent.toFixed(1) + '%',
      r.sharpeRatio.toFixed(2),
    ])
  );

  // ============ YEARLY RESULTS ============
  const years = ['2020', '2021', '2022', '2023', '2024', '2025'];

  for (const year of years) {
    const yearResults = allResults
      .filter(r => r.period === year)
      .sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);

    if (yearResults.length > 0) {
      printTable(
        `${year} RESULTS`,
        ['#', 'Strategy', 'PnL %', 'Trades', 'Win%', 'PF', 'MaxDD%'],
        yearResults.map((r, i) => [
          String(i + 1),
          r.strategy,
          r.totalPnlPercent.toFixed(1) + '%',
          String(r.totalTrades),
          r.winRate.toFixed(1) + '%',
          r.profitFactor === Infinity ? '∞' : r.profitFactor.toFixed(2),
          r.maxDrawdownPercent.toFixed(1) + '%',
        ])
      );
    }
  }

  // ============ STACKED RANKINGS BY YEAR ============
  const yearlyResults = allResults.filter(r => years.includes(r.period));
  const stackedRanks = calculateStackedRanks(yearlyResults);

  printTable(
    'STACKED RANKINGS BY YEAR (Higher Score = Better)',
    ['#', 'Strategy', 'Score', 'AvgRank', '2020', '2021', '2022', '2023', '2024', '2025'],
    stackedRanks.map((entry, i) => {
      const yearRanks = years.map(y => {
        const rank = entry.ranks.find(r => r.period === y);
        return rank ? `#${rank.rank}` : '-';
      });
      return [
        String(i + 1),
        entry.strategy,
        String(entry.score),
        entry.avgRank.toFixed(1),
        ...yearRanks,
      ];
    })
  );

  // ============ QUARTERLY SUMMARY ============
  const quarters = Object.keys(PERIODS).filter(p => p.includes('-Q'));
  const quarterlyStackedRanks = calculateStackedRanks(
    allResults.filter(r => r.period.includes('-Q'))
  );

  printTable(
    'STACKED RANKINGS BY QUARTER',
    ['#', 'Strategy', 'Score', 'AvgRank', 'Best Quarter', 'Worst Quarter'],
    quarterlyStackedRanks.map((entry, i) => {
      const best = entry.ranks.reduce((b, r) => r.rank < b.rank ? r : b, { period: '-', rank: 999 });
      const worst = entry.ranks.reduce((w, r) => r.rank > w.rank ? r : w, { period: '-', rank: 0 });
      return [
        String(i + 1),
        entry.strategy,
        String(entry.score),
        entry.avgRank.toFixed(1),
        `${best.period} (#${best.rank})`,
        `${worst.period} (#${worst.rank})`,
      ];
    })
  );

  // ============ CONSISTENCY ANALYSIS ============
  console.log(`\n${'═'.repeat(100)}`);
  console.log('  CONSISTENCY ANALYSIS (Yearly)');
  console.log('═'.repeat(100));
  console.log('Strategy'.padEnd(26) + '│ Profitable Years │ Avg PnL% │ StdDev  │ Best Year      │ Worst Year');
  console.log('─'.repeat(100));

  const consistencyData = strategyNames.map(strat => {
    const stratResults = allResults.filter(r => r.strategy === strat && years.includes(r.period));
    const positiveYears = stratResults.filter(r => r.totalPnlPercent > 0).length;
    const avgPnl = stratResults.reduce((s, r) => s + r.totalPnlPercent, 0) / stratResults.length;
    const stdDev = Math.sqrt(
      stratResults.reduce((s, r) => s + Math.pow(r.totalPnlPercent - avgPnl, 2), 0) / stratResults.length
    );
    const best = stratResults.reduce((b, r) => r.totalPnlPercent > b.totalPnlPercent ? r : b);
    const worst = stratResults.reduce((w, r) => r.totalPnlPercent < w.totalPnlPercent ? r : w);

    return { strat, positiveYears, total: stratResults.length, avgPnl, stdDev, best, worst };
  }).sort((a, b) => b.positiveYears - a.positiveYears || b.avgPnl - a.avgPnl);

  for (const d of consistencyData) {
    console.log(
      d.strat.padEnd(26) + '│ ' +
      `${d.positiveYears}/${d.total}`.padEnd(17) + '│ ' +
      `${d.avgPnl.toFixed(1)}%`.padStart(8) + ' │ ' +
      `${d.stdDev.toFixed(1)}%`.padStart(7) + ' │ ' +
      `${d.best.period}: ${d.best.totalPnlPercent.toFixed(0)}%`.padEnd(15) + '│ ' +
      `${d.worst.period}: ${d.worst.totalPnlPercent.toFixed(0)}%`
    );
  }

  // ============ QUARTERLY HEATMAP ============
  console.log(`\n${'═'.repeat(100)}`);
  console.log('  QUARTERLY PnL% HEATMAP');
  console.log('═'.repeat(100));

  // Header row with quarters
  const qHeaders = quarters.map(q => q.slice(-2)); // Just Q1, Q2, etc.
  console.log('Strategy'.padEnd(26) + '│' + qHeaders.map(h => h.padStart(8)).join('│'));
  console.log('─'.repeat(26 + quarters.length * 9));

  for (const strat of strategyNames) {
    const qResults = quarters.map(q => {
      const result = allResults.find(r => r.strategy === strat && r.period === q);
      if (!result) return '   -   ';
      const pnl = result.totalPnlPercent;
      const formatted = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}%`.padStart(7);
      return formatted;
    });
    console.log(strat.padEnd(26) + '│' + qResults.join('│'));
  }

  console.log(`\n${'═'.repeat(100)}`);
  console.log('  Analysis Complete!');
  console.log('═'.repeat(100));
}

main().catch(console.error);
