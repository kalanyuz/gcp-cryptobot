/**
 * Strategy Backtest Runner
 *
 * Compares the 3 core strategies on historical data:
 * 1. SMA Crossover - Best for clean trending markets
 * 2. CDC ActionZone - Filtered signals for choppy markets
 * 3. CDC-Confirmed SMA - Hybrid: best for volatile assets
 */

import { BacktestService } from './src/backtest/services/backtest.service';
import { getStrategy, listStrategies } from './src/backtest/strategies/sample-strategies';
import { Candle, BacktestConfig } from './src/backtest/entities/candle';

// Sample BTC monthly prices for testing
const BTC_MONTHLY: Record<string, number> = {
  '2020-01': 9350, '2020-02': 8600, '2020-03': 6400, '2020-04': 8800,
  '2020-05': 9450, '2020-06': 9150, '2020-07': 11350, '2020-08': 11650,
  '2020-09': 10800, '2020-10': 13800, '2020-11': 19700, '2020-12': 29000,
  '2021-01': 33100, '2021-02': 45200, '2021-03': 58800, '2021-04': 57800,
  '2021-05': 37300, '2021-06': 35000, '2021-07': 41500, '2021-08': 47100,
  '2021-09': 43800, '2021-10': 61300, '2021-11': 57000, '2021-12': 46300,
  '2022-01': 38500, '2022-02': 43200, '2022-03': 45500, '2022-04': 37600,
  '2022-05': 31800, '2022-06': 19800, '2022-07': 23300, '2022-08': 20050,
  '2022-09': 19400, '2022-10': 20500, '2022-11': 17150, '2022-12': 16500,
  '2023-01': 23100, '2023-02': 23500, '2023-03': 28500, '2023-04': 29300,
  '2023-05': 27200, '2023-06': 30500, '2023-07': 29200, '2023-08': 26000,
  '2023-09': 27000, '2023-10': 34500, '2023-11': 37700, '2023-12': 42500,
  '2024-01': 42500, '2024-02': 62000, '2024-03': 71000, '2024-04': 60000,
  '2024-05': 68000, '2024-06': 62500, '2024-07': 66000, '2024-08': 59000,
  '2024-09': 63500, '2024-10': 70000, '2024-11': 97000, '2024-12': 93500,
  '2025-01': 102000,
};

// Sample DOGE monthly prices for testing
const DOGE_MONTHLY: Record<string, number> = {
  '2020-01': 0.0023, '2020-02': 0.0024, '2020-03': 0.0019, '2020-04': 0.0025,
  '2020-05': 0.0026, '2020-06': 0.0025, '2020-07': 0.0032, '2020-08': 0.0034,
  '2020-09': 0.0026, '2020-10': 0.0026, '2020-11': 0.0034, '2020-12': 0.0047,
  '2021-01': 0.048, '2021-02': 0.052, '2021-03': 0.055, '2021-04': 0.26,
  '2021-05': 0.31, '2021-06': 0.25, '2021-07': 0.21, '2021-08': 0.29,
  '2021-09': 0.21, '2021-10': 0.27, '2021-11': 0.22, '2021-12': 0.17,
  '2022-01': 0.15, '2022-02': 0.12, '2022-03': 0.14, '2022-04': 0.14,
  '2022-05': 0.085, '2022-06': 0.067, '2022-07': 0.070, '2022-08': 0.063,
  '2022-09': 0.060, '2022-10': 0.12, '2022-11': 0.10, '2022-12': 0.07,
  '2023-01': 0.086, '2023-02': 0.083, '2023-03': 0.076, '2023-04': 0.073,
  '2023-05': 0.072, '2023-06': 0.065, '2023-07': 0.078, '2023-08': 0.063,
  '2023-09': 0.061, '2023-10': 0.068, '2023-11': 0.082, '2023-12': 0.091,
  '2024-01': 0.083, '2024-02': 0.13, '2024-03': 0.20, '2024-04': 0.15,
  '2024-05': 0.16, '2024-06': 0.13, '2024-07': 0.13, '2024-08': 0.10,
  '2024-09': 0.11, '2024-10': 0.14, '2024-11': 0.40, '2024-12': 0.32,
  '2025-01': 0.35,
};

function generateCandles(monthlyPrices: Record<string, number>, volatility = 0.03): Candle[] {
  const candles: Candle[] = [];
  const months = Object.keys(monthlyPrices).sort();

  for (let i = 0; i < months.length - 1; i++) {
    const startPrice = monthlyPrices[months[i]];
    const endPrice = monthlyPrices[months[i + 1]];
    const [year, month] = months[i].split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyChange = (endPrice - startPrice) / daysInMonth;

    for (let day = 1; day <= daysInMonth; day++) {
      const basePrice = startPrice + dailyChange * day;
      const noise = (Math.random() - 0.5) * basePrice * volatility;

      candles.push({
        timestamp: new Date(year, month - 1, day).getTime(),
        open: basePrice + noise * 0.3,
        high: basePrice + Math.abs(noise) * 0.8,
        low: basePrice - Math.abs(noise) * 0.8,
        close: basePrice + noise * 0.7,
        volume: 10000 + Math.random() * 20000,
      });
    }
  }

  return candles;
}

function runBacktest(candles: Candle[], strategyName: string, symbol: string) {
  const strategy = getStrategy(strategyName);
  if (!strategy) return null;
  if (strategy.init) strategy.init({});

  const backtestService = new BacktestService();
  const config: BacktestConfig = {
    symbol,
    timeframe: '1d',
    initialCapital: 10000,
    positionSizePercent: 95,
    commission: 0.001,
    slippage: 0.001,
  };

  return backtestService.runBacktest(candles, strategy, config);
}

async function main() {
  console.log('═'.repeat(80));
  console.log('  STRATEGY COMPARISON');
  console.log('═'.repeat(80));

  // List strategies
  console.log('\n  Available Strategies:');
  listStrategies().forEach((s, i) => {
    console.log(`    ${i + 1}. ${s.name}: ${s.description}`);
  });

  // Test on BTC
  console.log('\n' + '─'.repeat(80));
  console.log('  BTCUSDT (2020-2025) - Clean trending market');
  console.log('─'.repeat(80));

  const btcCandles = generateCandles(BTC_MONTHLY, 0.025);
  console.log(`  Generated ${btcCandles.length} daily candles\n`);

  console.log('  Strategy'.padEnd(25) + '│' + 'Return'.padStart(12) + '│' + 'Trades'.padStart(8) + '│' + 'Win%'.padStart(8) + '│' + 'MaxDD'.padStart(8));
  console.log('  ' + '─'.repeat(63));

  for (const s of listStrategies()) {
    const result = runBacktest(btcCandles, s.name, 'BTCUSDT');
    if (result) {
      console.log(
        `  ${s.name}`.padEnd(25) + '│' +
        `+${result.metrics.totalPnlPercent.toFixed(0)}%`.padStart(12) + '│' +
        String(result.metrics.totalTrades).padStart(8) + '│' +
        `${result.metrics.winRate.toFixed(0)}%`.padStart(8) + '│' +
        `${result.metrics.maxDrawdownPercent.toFixed(0)}%`.padStart(8)
      );
    }
  }

  // Test on DOGE
  console.log('\n' + '─'.repeat(80));
  console.log('  DOGEUSDT (2020-2025) - Volatile meme coin');
  console.log('─'.repeat(80));

  const dogeCandles = generateCandles(DOGE_MONTHLY, 0.07);
  console.log(`  Generated ${dogeCandles.length} daily candles\n`);

  console.log('  Strategy'.padEnd(25) + '│' + 'Return'.padStart(12) + '│' + 'Trades'.padStart(8) + '│' + 'Win%'.padStart(8) + '│' + 'MaxDD'.padStart(8));
  console.log('  ' + '─'.repeat(63));

  for (const s of listStrategies()) {
    const result = runBacktest(dogeCandles, s.name, 'DOGEUSDT');
    if (result) {
      console.log(
        `  ${s.name}`.padEnd(25) + '│' +
        `+${result.metrics.totalPnlPercent.toFixed(0)}%`.padStart(12) + '│' +
        String(result.metrics.totalTrades).padStart(8) + '│' +
        `${result.metrics.winRate.toFixed(0)}%`.padStart(8) + '│' +
        `${result.metrics.maxDrawdownPercent.toFixed(0)}%`.padStart(8)
      );
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('  RECOMMENDATION');
  console.log('═'.repeat(80));
  console.log(`
  • BTC/ETH (clean trends):     Use SMA Crossover
  • DOGE/meme coins (volatile): Use CDC-Confirmed SMA
  • Unknown market:             Use CDC ActionZone (safer)
  `);
}

main().catch(console.error);
