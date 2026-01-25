/**
 * Strategy Comparison with Historical BTC Price Data
 * Uses representative BTCUSDT daily data from 2020-2025
 */

import { BacktestService } from './src/backtest/services/backtest.service';
import { getStrategy, listStrategies } from './src/backtest/strategies/sample-strategies';
import { Candle, BacktestConfig } from './src/backtest/entities/candle';

// Historical BTCUSDT approximate monthly close prices (USD)
// Source: Historical data reference points
const MONTHLY_PRICES: Record<string, number> = {
  // 2020
  '2020-01': 9350, '2020-02': 8600, '2020-03': 6400, '2020-04': 8800,
  '2020-05': 9450, '2020-06': 9150, '2020-07': 11350, '2020-08': 11650,
  '2020-09': 10800, '2020-10': 13800, '2020-11': 19700, '2020-12': 29000,
  // 2021
  '2021-01': 33100, '2021-02': 45200, '2021-03': 58800, '2021-04': 57800,
  '2021-05': 37300, '2021-06': 35000, '2021-07': 41500, '2021-08': 47100,
  '2021-09': 43800, '2021-10': 61300, '2021-11': 57000, '2021-12': 46300,
  // 2022
  '2022-01': 38500, '2022-02': 43200, '2022-03': 45500, '2022-04': 37600,
  '2022-05': 31800, '2022-06': 19800, '2022-07': 23300, '2022-08': 20050,
  '2022-09': 19400, '2022-10': 20500, '2022-11': 17150, '2022-12': 16500,
  // 2023
  '2023-01': 23100, '2023-02': 23500, '2023-03': 28500, '2023-04': 29300,
  '2023-05': 27200, '2023-06': 30500, '2023-07': 29200, '2023-08': 26000,
  '2023-09': 27000, '2023-10': 34500, '2023-11': 37700, '2023-12': 42500,
  // 2024
  '2024-01': 42500, '2024-02': 62000, '2024-03': 71000, '2024-04': 60000,
  '2024-05': 68000, '2024-06': 62500, '2024-07': 66000, '2024-08': 59000,
  '2024-09': 63500, '2024-10': 70000, '2024-11': 97000, '2024-12': 93500,
  // 2025
  '2025-01': 102000,
};

function generateDailyCandles(): Candle[] {
  const candles: Candle[] = [];
  const months = Object.keys(MONTHLY_PRICES).sort();

  for (let i = 0; i < months.length - 1; i++) {
    const startPrice = MONTHLY_PRICES[months[i]];
    const endPrice = MONTHLY_PRICES[months[i + 1]];
    const [year, month] = months[i].split('-').map(Number);

    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyChange = (endPrice - startPrice) / daysInMonth;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const basePrice = startPrice + dailyChange * day;

      // Add realistic daily volatility (2-4%)
      const volatility = basePrice * (0.02 + Math.random() * 0.02);
      const noise = (Math.random() - 0.5) * volatility;

      const open = basePrice + noise * 0.3;
      const close = basePrice + noise * 0.7;
      const high = Math.max(open, close) + Math.abs(noise) * 0.5;
      const low = Math.min(open, close) - Math.abs(noise) * 0.5;
      const volume = 20000 + Math.random() * 30000;

      candles.push({
        timestamp: date.getTime(),
        open,
        high,
        low,
        close,
        volume,
      });
    }
  }

  // Add January 2025 (partial month)
  const jan2025Start = MONTHLY_PRICES['2024-12'];
  const jan2025End = MONTHLY_PRICES['2025-01'];
  for (let day = 1; day <= 25; day++) {
    const date = new Date(2025, 0, day);
    const basePrice = jan2025Start + ((jan2025End - jan2025Start) / 25) * day;
    const volatility = basePrice * 0.025;
    const noise = (Math.random() - 0.5) * volatility;

    candles.push({
      timestamp: date.getTime(),
      open: basePrice + noise * 0.3,
      high: basePrice + Math.abs(noise) * 0.8,
      low: basePrice - Math.abs(noise) * 0.8,
      close: basePrice + noise * 0.7,
      volume: 25000 + Math.random() * 35000,
    });
  }

  return candles;
}

// Rest of the code same as before...
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

function filterCandlesByPeriod(candles: Candle[], start: Date, end: Date): Candle[] {
  return candles.filter(c => c.timestamp >= start.getTime() && c.timestamp <= end.getTime());
}

function runBacktest(candles: Candle[], strategyName: string, period: string): StrategyResult | null {
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
    strategy: s, score: 0, avgRank: 0, ranks: [],
  }));

  for (const period of periods) {
    const periodResults = results.filter(r => r.period === period).sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);
    periodResults.forEach((result, index) => {
      const entry = rankEntries.find(e => e.strategy === result.strategy);
      if (entry) {
        entry.ranks.push({ period, rank: index + 1 });
        entry.score += (strategies.length - index);
      }
    });
  }

  rankEntries.forEach(e => {
    if (e.ranks.length > 0) e.avgRank = e.ranks.reduce((s, r) => s + r.rank, 0) / e.ranks.length;
  });

  return rankEntries.sort((a, b) => b.score - a.score);
}

function printTable(title: string, headers: string[], rows: string[][]) {
  console.log(`\n${'═'.repeat(110)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(110));

  const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] || '').length)) + 1);
  console.log(headers.map((h, i) => h.padEnd(colWidths[i])).join('│'));
  console.log('─'.repeat(colWidths.reduce((a, b) => a + b + 1, 0)));
  rows.forEach(row => console.log(row.map((c, i) => String(c || '').padEnd(colWidths[i])).join('│')));
}

async function main() {
  console.log('═'.repeat(110));
  console.log('  BTCUSDT STRATEGY COMPARISON: 2020-2025');
  console.log('  Initial Capital: $10,000 | Commission: 0.1% | Slippage: 0.05%');
  console.log('═'.repeat(110));

  console.log('\nGenerating daily candles from monthly price data...');
  const allCandles = generateDailyCandles();
  console.log(`Generated ${allCandles.length} daily candles\n`);

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

  // ALL-TIME
  const allTimeResults = allResults.filter(r => r.period === 'ALL_TIME').sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);
  printTable('ALL-TIME RESULTS (2020-2025)', ['#', 'Strategy', 'PnL $', 'PnL %', 'Trades', 'Win%', 'PF', 'MaxDD%', 'Sharpe'],
    allTimeResults.map((r, i) => [
      String(i + 1), r.strategy, '$' + r.totalPnl.toFixed(0), r.totalPnlPercent.toFixed(1) + '%',
      String(r.totalTrades), r.winRate.toFixed(1) + '%',
      r.profitFactor === Infinity ? '∞' : r.profitFactor.toFixed(2),
      r.maxDrawdownPercent.toFixed(1) + '%', r.sharpeRatio.toFixed(2)
    ])
  );

  // YEARLY
  const years = ['2020', '2021', '2022', '2023', '2024', '2025'];
  for (const year of years) {
    const yearResults = allResults.filter(r => r.period === year).sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);
    if (yearResults.length > 0) {
      printTable(`${year} RESULTS`, ['#', 'Strategy', 'PnL %', 'Trades', 'Win%', 'PF', 'MaxDD%'],
        yearResults.map((r, i) => [
          String(i + 1), r.strategy, r.totalPnlPercent.toFixed(1) + '%', String(r.totalTrades),
          r.winRate.toFixed(1) + '%', r.profitFactor === Infinity ? '∞' : r.profitFactor.toFixed(2),
          r.maxDrawdownPercent.toFixed(1) + '%'
        ])
      );
    }
  }

  // STACKED RANKINGS BY YEAR
  const stackedRanks = calculateStackedRanks(allResults.filter(r => years.includes(r.period)));
  printTable('STACKED RANKINGS BY YEAR', ['#', 'Strategy', 'Score', 'AvgRank', '2020', '2021', '2022', '2023', '2024', '2025'],
    stackedRanks.map((e, i) => [
      String(i + 1), e.strategy, String(e.score), e.avgRank.toFixed(1),
      ...years.map(y => { const r = e.ranks.find(x => x.period === y); return r ? `#${r.rank}` : '-'; })
    ])
  );

  // STACKED RANKINGS BY QUARTER
  const qRanks = calculateStackedRanks(allResults.filter(r => r.period.includes('-Q')));
  printTable('STACKED RANKINGS BY QUARTER', ['#', 'Strategy', 'Score', 'AvgRank', 'Best Quarter', 'Worst Quarter'],
    qRanks.map((e, i) => {
      const best = e.ranks.reduce((b, r) => r.rank < b.rank ? r : b, { period: '-', rank: 999 });
      const worst = e.ranks.reduce((w, r) => r.rank > w.rank ? r : w, { period: '-', rank: 0 });
      return [String(i + 1), e.strategy, String(e.score), e.avgRank.toFixed(1),
        `${best.period} (#${best.rank})`, `${worst.period} (#${worst.rank})`];
    })
  );

  // CONSISTENCY
  console.log(`\n${'═'.repeat(110)}`);
  console.log('  CONSISTENCY ANALYSIS');
  console.log('═'.repeat(110));
  console.log('Strategy'.padEnd(26) + '│ Profitable Yrs │ Avg PnL%  │ Best Year       │ Worst Year');
  console.log('─'.repeat(110));

  const consistency = strategyNames.map(s => {
    const res = allResults.filter(r => r.strategy === s && years.includes(r.period));
    const pos = res.filter(r => r.totalPnlPercent > 0).length;
    const avg = res.reduce((sum, r) => sum + r.totalPnlPercent, 0) / res.length;
    const best = res.reduce((b, r) => r.totalPnlPercent > b.totalPnlPercent ? r : b);
    const worst = res.reduce((w, r) => r.totalPnlPercent < w.totalPnlPercent ? r : w);
    return { s, pos, total: res.length, avg, best, worst };
  }).sort((a, b) => b.pos - a.pos || b.avg - a.avg);

  consistency.forEach(d => {
    console.log(`${d.s.padEnd(26)}│ ${`${d.pos}/${d.total}`.padEnd(15)}│ ${`${d.avg.toFixed(1)}%`.padStart(9)} │ ${`${d.best.period}: ${d.best.totalPnlPercent.toFixed(0)}%`.padEnd(16)}│ ${d.worst.period}: ${d.worst.totalPnlPercent.toFixed(0)}%`);
  });

  // QUARTERLY HEATMAP
  const quarters = Object.keys(PERIODS).filter(p => p.includes('-Q'));
  console.log(`\n${'═'.repeat(110)}`);
  console.log('  QUARTERLY PnL% HEATMAP');
  console.log('═'.repeat(110));
  console.log('Strategy'.padEnd(26) + '│' + quarters.map(q => q.slice(-7).padStart(9)).join('│'));
  console.log('─'.repeat(26 + quarters.length * 10));

  strategyNames.forEach(strat => {
    const vals = quarters.map(q => {
      const r = allResults.find(x => x.strategy === strat && x.period === q);
      return r ? `${r.totalPnlPercent >= 0 ? '+' : ''}${r.totalPnlPercent.toFixed(0)}%`.padStart(8) : '    -   ';
    });
    console.log(strat.padEnd(26) + '│' + vals.join('│'));
  });

  console.log(`\n${'═'.repeat(110)}`);
  console.log('  Analysis Complete!');
  console.log('═'.repeat(110));
}

main().catch(console.error);
