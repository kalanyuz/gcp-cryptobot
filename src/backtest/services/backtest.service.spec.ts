import { BacktestService } from './backtest.service';
import { Candle, Signal, IndicatorStrategy, BacktestConfig } from '../entities/candle';

// Simple test strategy that buys and sells at specific indices
class TestStrategy implements IndicatorStrategy {
  name = 'Test Strategy';
  description = 'Test';
  private buyIndices: number[];
  private sellIndices: number[];

  constructor(buyIndices: number[], sellIndices: number[]) {
    this.buyIndices = buyIndices;
    this.sellIndices = sellIndices;
  }

  calculate(candles: Candle[], index: number): Signal {
    if (this.buyIndices.includes(index)) return Signal.Buy;
    if (this.sellIndices.includes(index)) return Signal.Sell;
    return Signal.Hold;
  }
}

describe('BacktestService', () => {
  let service: BacktestService;

  beforeEach(() => {
    service = new BacktestService();
  });

  // Generate mock candle data
  const generateCandles = (count: number, startPrice: number, trend: number): Candle[] => {
    const candles: Candle[] = [];
    let price = startPrice;
    const baseTime = Date.now() - count * 24 * 60 * 60 * 1000;

    for (let i = 0; i < count; i++) {
      const variation = (Math.random() - 0.5) * 0.02 * price;
      price = price + trend + variation;

      candles.push({
        timestamp: baseTime + i * 24 * 60 * 60 * 1000,
        open: price - variation / 2,
        high: price + Math.abs(variation),
        low: price - Math.abs(variation),
        close: price,
        volume: 1000 + Math.random() * 500,
      });
    }
    return candles;
  };

  const defaultConfig: BacktestConfig = {
    symbol: 'BTCUSDT',
    timeframe: '1d',
    initialCapital: 10000,
    positionSizePercent: 100,
    commission: 0.001, // 0.1%
    slippage: 0.0005, // 0.05%
  };

  describe('runBacktest', () => {
    it('should run a backtest with no trades', () => {
      const candles = generateCandles(100, 50000, 0);
      const strategy = new TestStrategy([], []); // No buy/sell signals

      const result = service.runBacktest(candles, strategy, defaultConfig);

      expect(result.trades.length).toBe(0);
      expect(result.metrics.totalTrades).toBe(0);
      expect(result.metrics.totalPnl).toBe(0);
      expect(result.equityCurve.length).toBe(candles.length - 1);
    });

    it('should execute a single winning trade', () => {
      const candles: Candle[] = [];
      const baseTime = Date.now();

      // Create uptrending candles
      for (let i = 0; i < 20; i++) {
        candles.push({
          timestamp: baseTime + i * 24 * 60 * 60 * 1000,
          open: 100 + i * 5,
          high: 105 + i * 5,
          low: 95 + i * 5,
          close: 100 + i * 5,
          volume: 1000,
        });
      }

      const strategy = new TestStrategy([5], [10]); // Buy at index 5, sell at index 10
      const result = service.runBacktest(candles, strategy, defaultConfig);

      expect(result.trades.length).toBe(1);
      expect(result.metrics.winningTrades).toBe(1);
      expect(result.metrics.losingTrades).toBe(0);
      expect(result.metrics.totalPnl).toBeGreaterThan(0);
    });

    it('should execute a single losing trade', () => {
      const candles: Candle[] = [];
      const baseTime = Date.now();

      // Create downtrending candles
      for (let i = 0; i < 20; i++) {
        candles.push({
          timestamp: baseTime + i * 24 * 60 * 60 * 1000,
          open: 200 - i * 5,
          high: 205 - i * 5,
          low: 195 - i * 5,
          close: 200 - i * 5,
          volume: 1000,
        });
      }

      const strategy = new TestStrategy([5], [10]); // Buy at index 5, sell at index 10
      const result = service.runBacktest(candles, strategy, defaultConfig);

      expect(result.trades.length).toBe(1);
      expect(result.metrics.winningTrades).toBe(0);
      expect(result.metrics.losingTrades).toBe(1);
      expect(result.metrics.totalPnl).toBeLessThan(0);
    });

    it('should handle multiple trades', () => {
      const candles = generateCandles(100, 50000, 10);
      const strategy = new TestStrategy([10, 30, 50, 70], [20, 40, 60, 80]);

      const result = service.runBacktest(candles, strategy, defaultConfig);

      expect(result.trades.length).toBe(4);
      expect(result.metrics.totalTrades).toBe(4);
    });

    it('should apply commission to trades', () => {
      const candles: Candle[] = [];
      const baseTime = Date.now();

      // Flat price - no gain or loss from price movement
      for (let i = 0; i < 20; i++) {
        candles.push({
          timestamp: baseTime + i * 24 * 60 * 60 * 1000,
          open: 100,
          high: 100,
          low: 100,
          close: 100,
          volume: 1000,
        });
      }

      const configWithHighCommission = {
        ...defaultConfig,
        commission: 0.01, // 1% commission
        slippage: 0,
      };

      const strategy = new TestStrategy([5], [10]);
      const result = service.runBacktest(candles, strategy, configWithHighCommission);

      // With 1% commission on buy and sell, should lose money on flat price
      expect(result.metrics.totalPnl).toBeLessThan(0);
    });

    it('should calculate win rate correctly', () => {
      const candles: Candle[] = [];
      const baseTime = Date.now();

      // Create uptrending candles for winning trades
      for (let i = 0; i < 30; i++) {
        candles.push({
          timestamp: baseTime + i * 24 * 60 * 60 * 1000,
          open: 100 + i * 2,
          high: 105 + i * 2,
          low: 95 + i * 2,
          close: 100 + i * 2,
          volume: 1000,
        });
      }

      // Buy at 5, sell at 10 (win), buy at 15, sell at 20 (win)
      const strategy = new TestStrategy([5, 15], [10, 20]);
      const configNoFees = { ...defaultConfig, commission: 0, slippage: 0 };
      const result = service.runBacktest(candles, strategy, configNoFees);

      expect(result.metrics.winRate).toBe(100); // All winning trades
    });

    it('should close position at end of data', () => {
      const candles = generateCandles(50, 50000, 0);
      const strategy = new TestStrategy([10], []); // Buy but never sell

      const result = service.runBacktest(candles, strategy, defaultConfig);

      // Position should be closed at the last candle
      expect(result.trades.length).toBe(1);
      expect(result.trades[0].exitTime).toBeDefined();
    });

    it('should throw error for insufficient data', () => {
      const candles: Candle[] = [
        { timestamp: Date.now(), open: 100, high: 100, low: 100, close: 100, volume: 100 },
      ];
      const strategy = new TestStrategy([], []);

      expect(() => service.runBacktest(candles, strategy, defaultConfig)).toThrow(
        'Insufficient candle data',
      );
    });
  });

  describe('formatResults', () => {
    it('should format results as readable string', () => {
      const candles = generateCandles(100, 50000, 10);
      const strategy = new TestStrategy([10, 30], [20, 40]);

      const result = service.runBacktest(candles, strategy, defaultConfig);
      const formatted = service.formatResults(result);

      expect(formatted).toContain('BACKTEST RESULTS');
      expect(formatted).toContain('BTCUSDT');
      expect(formatted).toContain('Total Trades');
      expect(formatted).toContain('Win Rate');
    });
  });

  describe('metrics calculation', () => {
    it('should calculate max drawdown', () => {
      const candles: Candle[] = [];
      const baseTime = Date.now();

      // Create a pattern with clear drawdown: up then down then up
      // Start at 100, go to 150, drop to 80, recover to 120
      const prices = [100, 110, 120, 130, 140, 150, 130, 100, 80, 90, 100, 110, 120];
      for (let i = 0; i < prices.length; i++) {
        candles.push({
          timestamp: baseTime + i * 24 * 60 * 60 * 1000,
          open: prices[i],
          high: prices[i] + 5,
          low: prices[i] - 5,
          close: prices[i],
          volume: 1000,
        });
      }

      // Buy at index 1 (price 110), hold through drawdown, sell at end
      const strategy = new TestStrategy([1], [12]);
      const configNoFees = { ...defaultConfig, commission: 0, slippage: 0 };
      const result = service.runBacktest(candles, strategy, configNoFees);

      // Should have drawdown when price dropped from 150 to 80
      expect(result.metrics.maxDrawdownPercent).toBeGreaterThan(0);
    });

    it('should calculate profit factor', () => {
      const candles = generateCandles(100, 50000, 50);
      const strategy = new TestStrategy([10, 30, 50, 70], [20, 40, 60, 80]);

      const result = service.runBacktest(candles, strategy, defaultConfig);

      if (result.metrics.losingTrades > 0 && result.metrics.winningTrades > 0) {
        expect(result.metrics.profitFactor).toBeGreaterThan(0);
      }
    });
  });
});
