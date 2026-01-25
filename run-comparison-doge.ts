/**
 * Strategy Comparison with Historical DOGE Price Data
 * Uses representative DOGEUSDT daily data from 2020-2025
 *
 * DOGE characteristics:
 * - Much more volatile than BTC
 * - Prone to sudden pumps/dumps (meme coin dynamics)
 * - Less clean trends, more whipsaws
 * - Social media driven (Elon tweets, etc)
 */

import { BacktestService } from './src/backtest/services/backtest.service';
import { getStrategy, listStrategies } from './src/backtest/strategies/sample-strategies';
import { Candle, BacktestConfig } from './src/backtest/entities/candle';

// Historical DOGEUSDT approximate monthly close prices (USD)
// Source: Historical data reference points
const MONTHLY_PRICES: Record<string, number> = {
  // 2020 - DOGE was basically flat/dead
  '2020-01': 0.0023, '2020-02': 0.0024, '2020-03': 0.0019, '2020-04': 0.0025,
  '2020-05': 0.0026, '2020-06': 0.0025, '2020-07': 0.0032, '2020-08': 0.0034,
  '2020-09': 0.0026, '2020-10': 0.0026, '2020-11': 0.0034, '2020-12': 0.0047,
  // 2021 - THE DOGE YEAR (Elon tweets, SNL, etc)
  '2021-01': 0.048,   // TikTok pump started
  '2021-02': 0.052,
  '2021-03': 0.055,
  '2021-04': 0.26,    // Major pump before SNL
  '2021-05': 0.31,    // SNL peak then crash
  '2021-06': 0.25,
  '2021-07': 0.21,
  '2021-08': 0.29,
  '2021-09': 0.21,
  '2021-10': 0.27,
  '2021-11': 0.22,
  '2021-12': 0.17,
  // 2022 - Bear market
  '2022-01': 0.15, '2022-02': 0.12, '2022-03': 0.14, '2022-04': 0.14,
  '2022-05': 0.085, '2022-06': 0.067, '2022-07': 0.070, '2022-08': 0.063,
  '2022-09': 0.060, '2022-10': 0.12,  // Elon Twitter acquisition pump
  '2022-11': 0.10, '2022-12': 0.07,
  // 2023 - Consolidation
  '2023-01': 0.086, '2023-02': 0.083, '2023-03': 0.076, '2023-04': 0.073,
  '2023-05': 0.072, '2023-06': 0.065, '2023-07': 0.078, '2023-08': 0.063,
  '2023-09': 0.061, '2023-10': 0.068, '2023-11': 0.082, '2023-12': 0.091,
  // 2024 - Recovery and pumps
  '2024-01': 0.083, '2024-02': 0.13, '2024-03': 0.20, '2024-04': 0.15,
  '2024-05': 0.16, '2024-06': 0.13, '2024-07': 0.13, '2024-08': 0.10,
  '2024-09': 0.11, '2024-10': 0.14, '2024-11': 0.40,  // Election pump
  '2024-12': 0.32,
  // 2025
  '2025-01': 0.35,
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

      // DOGE has MUCH higher volatility than BTC (5-10%)
      const volatility = basePrice * (0.05 + Math.random() * 0.05);
      const noise = (Math.random() - 0.5) * volatility;

      const open = basePrice + noise * 0.3;
      const close = basePrice + noise * 0.7;
      const high = Math.max(open, close) + Math.abs(noise) * 0.5;
      const low = Math.min(open, close) - Math.abs(noise) * 0.5;
      const volume = 1000000000 + Math.random() * 2000000000; // DOGE has huge volume

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
    const volatility = basePrice * 0.07;
    const noise = (Math.random() - 0.5) * volatility;

    candles.push({
      timestamp: date.getTime(),
      open: basePrice + noise * 0.3,
      high: basePrice + Math.abs(noise) * 0.8,
      low: basePrice - Math.abs(noise) * 0.8,
      close: basePrice + noise * 0.7,
      volume: 1500000000 + Math.random() * 2000000000,
    });
  }

  return candles;
}

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
    symbol: 'DOGEUSDT',
    timeframe: '1d',
    initialCapital: 10000,
    positionSizePercent: 95,
    commission: 0.001,
    slippage: 0.001, // Higher slippage for DOGE
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
  console.log('  🐕 DOGEUSDT STRATEGY COMPARISON: 2020-2025');
  console.log('  Initial Capital: $10,000 | Commission: 0.1% | Slippage: 0.1%');
  console.log('═'.repeat(110));

  console.log(`
  📊 DOGE CHARACTERISTICS (vs BTC):
  ┌────────────────────────────────────────────────────────────────────────────┐
  │ • Much higher daily volatility (5-10% vs 2-4% for BTC)                     │
  │ • Prone to sudden pump-and-dump patterns                                   │
  │ • Social media driven (Elon tweets = instant 20%+ moves)                   │
  │ • Less established trends, more noise and whipsaws                         │
  │ • 2021 was insane: $0.005 → $0.70 → $0.17 (100x then -75%)                │
  └────────────────────────────────────────────────────────────────────────────┘
  `);

  console.log('Generating daily candles from monthly price data...');
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
  const years = ['2020', '2021', '2022', '2023', '2024'];
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

  // ============ HEAD-TO-HEAD: SMA CROSSOVER vs CDC ACTIONZONE ============
  console.log(`\n${'═'.repeat(110)}`);
  console.log('  🔬 HEAD-TO-HEAD: SMA CROSSOVER vs CDC ACTIONZONE (on DOGE)');
  console.log('═'.repeat(110));

  const smaResults = allResults.filter(r => r.strategy === 'sma-crossover');
  const cdcResults = allResults.filter(r => r.strategy === 'cdc-actionzone');

  console.log(`
  HYPOTHESIS: CDC ActionZone should perform BETTER on DOGE because:
  ┌────────────────────────────────────────────────────────────────────────────┐
  │ • DOGE has more false breakouts and whipsaws                               │
  │ • Price confirmation filter should reduce getting caught in pump-dumps     │
  │ • Higher volatility means more opportunities for MA crossovers to fail     │
  │ • Zone system helps distinguish real trends from noise                     │
  └────────────────────────────────────────────────────────────────────────────┘
  `);

  // Period-by-period comparison
  console.log('\n  PERIOD-BY-PERIOD COMPARISON:');
  console.log('  ' + 'Period'.padEnd(12) + '│' + 'SMA PnL%'.padStart(12) + '│' + 'CDC PnL%'.padStart(12) + '│' + 'Winner'.padStart(20) + '│' + 'Margin'.padStart(10));
  console.log('  ' + '─'.repeat(66));

  const allPeriods = ['ALL_TIME', ...years];
  let smaWins = 0;
  let cdcWins = 0;

  allPeriods.forEach(period => {
    const sma = smaResults.find(r => r.period === period);
    const cdc = cdcResults.find(r => r.period === period);

    if (sma && cdc) {
      const smaPnl = sma.totalPnlPercent;
      const cdcPnl = cdc.totalPnlPercent;
      const winner = smaPnl > cdcPnl ? 'SMA Crossover' : cdcPnl > smaPnl ? 'CDC ActionZone' : 'Tie';
      const margin = Math.abs(smaPnl - cdcPnl);

      if (smaPnl > cdcPnl) smaWins++;
      else if (cdcPnl > smaPnl) cdcWins++;

      console.log('  ' +
        period.padEnd(12) + '│' +
        `${smaPnl >= 0 ? '+' : ''}${smaPnl.toFixed(1)}%`.padStart(12) + '│' +
        `${cdcPnl >= 0 ? '+' : ''}${cdcPnl.toFixed(1)}%`.padStart(12) + '│' +
        (winner.includes('CDC') ? '🔵 ' + winner : winner.includes('SMA') ? '⚪ ' + winner : winner).padStart(24) + '│' +
        `${margin.toFixed(1)}%`.padStart(10)
      );
    }
  });

  console.log('  ' + '─'.repeat(66));
  console.log(`  SCORE: SMA Crossover: ${smaWins} wins | CDC ActionZone: ${cdcWins} wins`);

  // Trade efficiency comparison
  console.log('\n  TRADE EFFICIENCY COMPARISON:');
  const smaAllTime = smaResults.find(r => r.period === 'ALL_TIME');
  const cdcAllTime = cdcResults.find(r => r.period === 'ALL_TIME');

  if (smaAllTime && cdcAllTime) {
    console.log('  ' + 'Metric'.padEnd(25) + '│' + 'SMA Crossover'.padStart(15) + '│' + 'CDC ActionZone'.padStart(15));
    console.log('  ' + '─'.repeat(57));
    console.log('  ' + 'Total Trades'.padEnd(25) + '│' + String(smaAllTime.totalTrades).padStart(15) + '│' + String(cdcAllTime.totalTrades).padStart(15));
    console.log('  ' + 'Win Rate'.padEnd(25) + '│' + `${smaAllTime.winRate.toFixed(1)}%`.padStart(15) + '│' + `${cdcAllTime.winRate.toFixed(1)}%`.padStart(15));
    console.log('  ' + 'Profit Factor'.padEnd(25) + '│' + (smaAllTime.profitFactor === Infinity ? '∞' : smaAllTime.profitFactor.toFixed(2)).padStart(15) + '│' + (cdcAllTime.profitFactor === Infinity ? '∞' : cdcAllTime.profitFactor.toFixed(2)).padStart(15));
    console.log('  ' + 'Max Drawdown'.padEnd(25) + '│' + `${smaAllTime.maxDrawdownPercent.toFixed(1)}%`.padStart(15) + '│' + `${cdcAllTime.maxDrawdownPercent.toFixed(1)}%`.padStart(15));
    console.log('  ' + 'Sharpe Ratio'.padEnd(25) + '│' + smaAllTime.sharpeRatio.toFixed(2).padStart(15) + '│' + cdcAllTime.sharpeRatio.toFixed(2).padStart(15));
    console.log('  ' + 'Total PnL %'.padEnd(25) + '│' + `${smaAllTime.totalPnlPercent >= 0 ? '+' : ''}${smaAllTime.totalPnlPercent.toFixed(1)}%`.padStart(15) + '│' + `${cdcAllTime.totalPnlPercent >= 0 ? '+' : ''}${cdcAllTime.totalPnlPercent.toFixed(1)}%`.padStart(15));
  }

  // Quarterly comparison for DOGE
  const quarters = Object.keys(PERIODS).filter(p => p.includes('-Q'));
  const cdcAdvantage: string[] = [];
  const smaAdvantage: string[] = [];

  quarters.forEach(q => {
    const sma = smaResults.find(r => r.period === q);
    const cdc = cdcResults.find(r => r.period === q);
    if (sma && cdc) {
      const diff = cdc.totalPnlPercent - sma.totalPnlPercent;
      if (diff > 5) cdcAdvantage.push(`${q}: CDC +${diff.toFixed(0)}% better`);
      if (diff < -5) smaAdvantage.push(`${q}: SMA +${Math.abs(diff).toFixed(0)}% better`);
    }
  });

  console.log(`\n  WHERE EACH STRATEGY EXCELS (>5% advantage):`);
  console.log('  ' + '─'.repeat(80));

  console.log('\n  🔵 CDC ActionZone excels in:');
  if (cdcAdvantage.length > 0) {
    cdcAdvantage.forEach(a => console.log(`     • ${a}`));
  } else {
    console.log('     • (No quarters with >5% advantage)');
  }

  console.log('\n  ⚪ SMA Crossover excels in:');
  if (smaAdvantage.length > 0) {
    smaAdvantage.forEach(a => console.log(`     • ${a}`));
  } else {
    console.log('     • (No quarters with >5% advantage)');
  }

  // Final comparison with BTC results
  console.log(`\n${'═'.repeat(110)}`);
  console.log('  📊 DOGE vs BTC COMPARISON SUMMARY');
  console.log('═'.repeat(110));

  console.log(`
  🐕 DOGE RESULTS:
     SMA Crossover wins: ${smaWins} periods
     CDC ActionZone wins: ${cdcWins} periods
     ${cdcWins > smaWins ? '→ CDC ActionZone performs BETTER on DOGE (as hypothesized!)' :
       smaWins > cdcWins ? '→ SMA Crossover still wins, but check the margins...' :
       '→ Strategies are more evenly matched on DOGE'}

  💰 BTC RESULTS (from previous run):
     SMA Crossover wins: 5 periods
     CDC ActionZone wins: 1 period
     → SMA Crossover dominated on BTC's cleaner trends

  🎯 KEY INSIGHT:
  ┌────────────────────────────────────────────────────────────────────────────┐
  │ If CDC ActionZone wins more periods on DOGE than on BTC, it validates      │
  │ the hypothesis that the price confirmation filter is more valuable on      │
  │ volatile, choppy assets with more false breakouts.                         │
  │                                                                            │
  │ If SMA Crossover still wins on DOGE, it suggests that the meme coin's      │
  │ massive trends (100x moves) favor simpler strategies that capture the      │
  │ full move without filtering.                                               │
  └────────────────────────────────────────────────────────────────────────────┘
  `);

  console.log('═'.repeat(110));
  console.log('  DOGE Analysis Complete!');
  console.log('═'.repeat(110));
}

main().catch(console.error);
