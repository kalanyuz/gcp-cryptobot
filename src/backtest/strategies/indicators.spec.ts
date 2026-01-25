import { Candle } from '../entities/candle';
import {
  SMA,
  EMA,
  RSI,
  MACD,
  BollingerBands,
  ATR,
  Stochastic,
  OBV,
  CCI,
  WilliamsR,
} from './indicators';

describe('Technical Indicators', () => {
  // Generate mock candle data for testing
  const generateCandles = (closes: number[]): Candle[] => {
    return closes.map((close, i) => ({
      timestamp: Date.now() + i * 60000,
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1000 + i * 10,
    }));
  };

  describe('SMA', () => {
    it('should calculate simple moving average correctly', () => {
      const candles = generateCandles([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
      const sma = SMA(candles, 5, 4);

      // Average of 10, 11, 12, 13, 14 = 12
      expect(sma).toBe(12);
    });

    it('should return null for insufficient data', () => {
      const candles = generateCandles([10, 11, 12]);
      const sma = SMA(candles, 5, 2);

      expect(sma).toBeNull();
    });

    it('should calculate at different indices', () => {
      const candles = generateCandles([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

      // SMA at index 4 (period 5): avg of 10,11,12,13,14 = 12
      expect(SMA(candles, 5, 4)).toBe(12);

      // SMA at index 5 (period 5): avg of 11,12,13,14,15 = 13
      expect(SMA(candles, 5, 5)).toBe(13);
    });
  });

  describe('EMA', () => {
    it('should return SMA for first EMA value', () => {
      const candles = generateCandles([10, 11, 12, 13, 14]);
      const ema = EMA(candles, 5, 4);
      const sma = SMA(candles, 5, 4);

      expect(ema).toBe(sma);
    });

    it('should return null for insufficient data', () => {
      const candles = generateCandles([10, 11, 12]);
      const ema = EMA(candles, 5, 2);

      expect(ema).toBeNull();
    });

    it('should be closer to recent prices than SMA', () => {
      const candles = generateCandles([10, 10, 10, 10, 10, 20, 20, 20]);
      const ema = EMA(candles, 5, 7);
      const sma = SMA(candles, 5, 7);

      // EMA should be closer to 20 (recent prices) than SMA
      expect(ema).toBeGreaterThan(sma!);
    });
  });

  describe('RSI', () => {
    it('should return 100 for only gains', () => {
      const candles = generateCandles([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
      const rsi = RSI(candles, 14, 14);

      expect(rsi).toBe(100);
    });

    it('should return 0 for only losses', () => {
      const candles = generateCandles([100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87, 86]);
      const rsi = RSI(candles, 14, 14);

      expect(rsi).toBe(0);
    });

    it('should return ~50 for balanced gains/losses', () => {
      // Alternating up and down by same amount
      const candles = generateCandles([100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100]);
      const rsi = RSI(candles, 14, 14);

      expect(rsi).toBeGreaterThan(40);
      expect(rsi).toBeLessThan(60);
    });

    it('should return null for insufficient data', () => {
      const candles = generateCandles([10, 11, 12]);
      const rsi = RSI(candles, 14, 2);

      expect(rsi).toBeNull();
    });
  });

  describe('MACD', () => {
    it('should return null for insufficient data', () => {
      const candles = generateCandles([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
      const macd = MACD(candles, 12, 26, 9, 10);

      expect(macd).toBeNull();
    });

    it('should calculate MACD values', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
      const candles = generateCandles(prices);
      const macd = MACD(candles, 12, 26, 9, 49);

      expect(macd).not.toBeNull();
      expect(macd!.macd).toBeDefined();
      expect(macd!.signal).toBeDefined();
      expect(macd!.histogram).toBeDefined();
      expect(macd!.histogram).toBe(macd!.macd - macd!.signal);
    });
  });

  describe('BollingerBands', () => {
    it('should calculate middle band as SMA', () => {
      const candles = generateCandles([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
      const bb = BollingerBands(candles, 5, 2, 4);
      const sma = SMA(candles, 5, 4);

      expect(bb!.middle).toBe(sma);
    });

    it('should have upper > middle > lower', () => {
      const candles = generateCandles([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
      const bb = BollingerBands(candles, 5, 2, 10);

      expect(bb!.upper).toBeGreaterThan(bb!.middle);
      expect(bb!.middle).toBeGreaterThan(bb!.lower);
    });

    it('should return null for insufficient data', () => {
      const candles = generateCandles([10, 11, 12]);
      const bb = BollingerBands(candles, 5, 2, 2);

      expect(bb).toBeNull();
    });

    it('should have wider bands with higher std dev multiplier', () => {
      const candles = generateCandles([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
      const bb1 = BollingerBands(candles, 5, 1, 10);
      const bb2 = BollingerBands(candles, 5, 2, 10);

      const width1 = bb1!.upper - bb1!.lower;
      const width2 = bb2!.upper - bb2!.lower;

      expect(width2).toBeGreaterThan(width1);
    });
  });

  describe('ATR', () => {
    it('should calculate average true range', () => {
      const candles: Candle[] = [];
      for (let i = 0; i < 20; i++) {
        candles.push({
          timestamp: Date.now() + i * 60000,
          open: 100,
          high: 110, // TR = 10 for each candle
          low: 100,
          close: 105,
          volume: 1000,
        });
      }

      const atr = ATR(candles, 14, 15);
      expect(atr).toBeCloseTo(10, 0);
    });

    it('should return null for insufficient data', () => {
      const candles = generateCandles([10, 11, 12]);
      const atr = ATR(candles, 14, 2);

      expect(atr).toBeNull();
    });
  });

  describe('Stochastic', () => {
    it('should return ~100 when close at period high', () => {
      const candles: Candle[] = [];
      for (let i = 0; i < 20; i++) {
        candles.push({
          timestamp: Date.now() + i * 60000,
          open: 100 + i,
          high: 105 + i,
          low: 95 + i,
          close: 105 + i, // Close at high
          volume: 1000,
        });
      }

      const stoch = Stochastic(candles, 14, 3, 19);
      expect(stoch!.k).toBeGreaterThan(90);
    });

    it('should return ~0 when close at period low', () => {
      const candles: Candle[] = [];
      for (let i = 0; i < 20; i++) {
        candles.push({
          timestamp: Date.now() + i * 60000,
          open: 200 - i,
          high: 205 - i,
          low: 195 - i,
          close: 195 - i, // Close at low
          volume: 1000,
        });
      }

      const stoch = Stochastic(candles, 14, 3, 19);
      expect(stoch!.k).toBeLessThan(10);
    });
  });

  describe('OBV', () => {
    it('should increase on up candles', () => {
      const candles = generateCandles([100, 101, 102, 103, 104]);
      const obv = OBV(candles, 4);

      expect(obv).toBeGreaterThan(0);
    });

    it('should decrease on down candles', () => {
      const candles = generateCandles([100, 99, 98, 97, 96]);
      const obv = OBV(candles, 4);

      expect(obv).toBeLessThan(0);
    });
  });

  describe('CCI', () => {
    it('should return positive values in uptrend', () => {
      const candles: Candle[] = [];
      for (let i = 0; i < 25; i++) {
        const price = 100 + i * 2;
        candles.push({
          timestamp: Date.now() + i * 60000,
          open: price,
          high: price + 1,
          low: price - 1,
          close: price,
          volume: 1000,
        });
      }

      const cci = CCI(candles, 20, 24);
      expect(cci).toBeGreaterThan(0);
    });

    it('should return null for insufficient data', () => {
      const candles = generateCandles([10, 11, 12]);
      const cci = CCI(candles, 20, 2);

      expect(cci).toBeNull();
    });
  });

  describe('WilliamsR', () => {
    it('should return close to 0 when close near high', () => {
      const candles: Candle[] = [];
      for (let i = 0; i < 20; i++) {
        candles.push({
          timestamp: Date.now() + i * 60000,
          open: 100,
          high: 110,
          low: 90,
          close: 109, // Near high
          volume: 1000,
        });
      }

      const wr = WilliamsR(candles, 14, 15);
      expect(wr).toBeGreaterThan(-10);
    });

    it('should return close to -100 when close near low', () => {
      const candles: Candle[] = [];
      for (let i = 0; i < 20; i++) {
        candles.push({
          timestamp: Date.now() + i * 60000,
          open: 100,
          high: 110,
          low: 90,
          close: 91, // Near low
          volume: 1000,
        });
      }

      const wr = WilliamsR(candles, 14, 15);
      expect(wr).toBeLessThan(-90);
    });
  });
});
