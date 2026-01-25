import { HttpService, Injectable } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { map, expand, takeWhile, reduce, delay, catchError } from 'rxjs/operators';
import { Candle, CandleRequest, Timeframe } from '../entities/candle';

/**
 * Service for fetching historical OHLCV candle data from Binance
 * Uses public endpoints - no API key required
 */
@Injectable()
export class CandleService {
  private readonly baseURL = 'https://api.binance.com';
  private readonly maxCandlesPerRequest = 1000;
  private cache: Map<string, { candles: Candle[]; timestamp: number }> = new Map();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor(private httpService: HttpService) {}

  /**
   * Fetch candles for a symbol and timeframe
   * Automatically paginates to fetch all requested data
   */
  fetchCandles(request: CandleRequest): Observable<Candle[]> {
    const cacheKey = this.getCacheKey(request);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return of(cached.candles);
    }

    const endTime = request.endTime || Date.now();
    const startTime = request.startTime || this.getDefaultStartTime(request.timeframe);

    return this.fetchCandlesPaginated(request.symbol, request.timeframe, startTime, endTime).pipe(
      map((candles) => {
        this.cache.set(cacheKey, { candles, timestamp: Date.now() });
        return candles;
      }),
    );
  }

  /**
   * Fetch candles with automatic pagination for large date ranges
   */
  private fetchCandlesPaginated(
    symbol: string,
    timeframe: Timeframe,
    startTime: number,
    endTime: number,
  ): Observable<Candle[]> {
    let currentStart = startTime;
    let allCandles: Candle[] = [];

    return this.fetchCandleBatch(symbol, timeframe, currentStart, endTime).pipe(
      expand((batch) => {
        if (batch.length === 0 || batch.length < this.maxCandlesPerRequest) {
          return of([]);
        }
        const lastCandle = batch[batch.length - 1];
        currentStart = lastCandle.timestamp + 1;
        if (currentStart >= endTime) {
          return of([]);
        }
        // Add small delay to respect rate limits
        return this.fetchCandleBatch(symbol, timeframe, currentStart, endTime).pipe(delay(100));
      }),
      takeWhile((batch) => batch.length > 0, true),
      reduce((acc, batch) => {
        acc.push(...batch);
        return acc;
      }, allCandles),
      map((candles) => this.deduplicateCandles(candles)),
    );
  }

  /**
   * Fetch a single batch of candles (max 1000)
   */
  private fetchCandleBatch(
    symbol: string,
    timeframe: Timeframe,
    startTime: number,
    endTime: number,
  ): Observable<Candle[]> {
    const path = '/api/v3/klines';
    const params = new URLSearchParams({
      symbol: symbol.toUpperCase(),
      interval: timeframe,
      startTime: startTime.toString(),
      endTime: endTime.toString(),
      limit: this.maxCandlesPerRequest.toString(),
    });

    return this.httpService.get(`${this.baseURL}${path}?${params.toString()}`).pipe(
      map((response) => this.parseKlines(response.data)),
      catchError((error) => {
        console.error('Error fetching candles:', error.response?.data || error.message);
        return of([]);
      }),
    );
  }

  /**
   * Parse Binance kline response to Candle array
   * Binance returns: [openTime, open, high, low, close, volume, closeTime, ...]
   */
  private parseKlines(data: any[]): Candle[] {
    return data.map((kline) => ({
      timestamp: kline[0],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
    }));
  }

  /**
   * Remove duplicate candles by timestamp
   */
  private deduplicateCandles(candles: Candle[]): Candle[] {
    const seen = new Set<number>();
    return candles.filter((candle) => {
      if (seen.has(candle.timestamp)) {
        return false;
      }
      seen.add(candle.timestamp);
      return true;
    });
  }

  /**
   * Get default start time based on timeframe (fetch reasonable history)
   */
  private getDefaultStartTime(timeframe: Timeframe): number {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const defaults: Record<Timeframe, number> = {
      '1m': now - 7 * day, // 1 week
      '3m': now - 14 * day, // 2 weeks
      '5m': now - 30 * day, // 1 month
      '15m': now - 60 * day, // 2 months
      '30m': now - 90 * day, // 3 months
      '1h': now - 180 * day, // 6 months
      '2h': now - 365 * day, // 1 year
      '4h': now - 365 * day, // 1 year
      '6h': now - 730 * day, // 2 years
      '8h': now - 730 * day, // 2 years
      '12h': now - 730 * day, // 2 years
      '1d': now - 1095 * day, // 3 years
      '3d': now - 1825 * day, // 5 years
      '1w': now - 2555 * day, // 7 years
      '1M': now - 2555 * day, // 7 years
    };

    return defaults[timeframe];
  }

  /**
   * Generate cache key for request
   */
  private getCacheKey(request: CandleRequest): string {
    return `${request.symbol}-${request.timeframe}-${request.startTime || 'default'}-${request.endTime || 'now'}`;
  }

  /**
   * Get available trading pairs from Binance
   */
  getAvailableSymbols(): Observable<string[]> {
    return this.httpService.get(`${this.baseURL}/api/v3/exchangeInfo`).pipe(
      map((response) =>
        response.data.symbols
          .filter((s: any) => s.status === 'TRADING')
          .map((s: any) => s.symbol),
      ),
      catchError((error) => {
        console.error('Error fetching symbols:', error.response?.data || error.message);
        return of([]);
      }),
    );
  }

  /**
   * Clear the candle cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Convert timeframe string to milliseconds
   */
  timeframeToMs(timeframe: Timeframe): number {
    const multipliers: Record<Timeframe, number> = {
      '1m': 60 * 1000,
      '3m': 3 * 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '2h': 2 * 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '8h': 8 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
      '1M': 30 * 24 * 60 * 60 * 1000,
    };
    return multipliers[timeframe];
  }
}
