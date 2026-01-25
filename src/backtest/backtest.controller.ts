import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CandleService } from './services/candle.service';
import { BacktestService } from './services/backtest.service';
import { Timeframe, BacktestConfig, Candle } from './entities/candle';
import { getStrategy, listStrategies } from './strategies/sample-strategies';

interface BacktestRequest {
  symbol: string;
  timeframe: Timeframe;
  strategy: string;
  strategyParams?: Record<string, any>;
  startTime?: number;
  endTime?: number;
  initialCapital?: number;
  positionSizePercent?: number;
  commission?: number;
  slippage?: number;
}

interface CandleRequest {
  symbol: string;
  timeframe: Timeframe;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

@Controller('backtest')
export class BacktestController {
  constructor(
    private readonly candleService: CandleService,
    private readonly backtestService: BacktestService,
  ) {}

  /**
   * Health check endpoint
   */
  @Get('health')
  health() {
    return { status: 'ok', service: 'backtest' };
  }

  /**
   * List available strategies
   */
  @Get('strategies')
  getStrategies() {
    return listStrategies();
  }

  /**
   * Fetch historical candle data
   */
  @Post('candles')
  async getCandles(@Body() request: CandleRequest) {
    if (!request.symbol) {
      throw new HttpException('Symbol is required', HttpStatus.BAD_REQUEST);
    }
    if (!request.timeframe) {
      throw new HttpException('Timeframe is required', HttpStatus.BAD_REQUEST);
    }

    const candles = await this.candleService
      .fetchCandles({
        symbol: request.symbol.toUpperCase(),
        timeframe: request.timeframe,
        startTime: request.startTime,
        endTime: request.endTime,
        limit: request.limit,
      })
      .toPromise();

    return {
      symbol: request.symbol.toUpperCase(),
      timeframe: request.timeframe,
      count: candles.length,
      startTime: candles.length > 0 ? candles[0].timestamp : null,
      endTime: candles.length > 0 ? candles[candles.length - 1].timestamp : null,
      candles,
    };
  }

  /**
   * Run a backtest with specified strategy
   */
  @Post('run')
  async runBacktest(@Body() request: BacktestRequest) {
    // Validate required fields
    if (!request.symbol) {
      throw new HttpException('Symbol is required', HttpStatus.BAD_REQUEST);
    }
    if (!request.timeframe) {
      throw new HttpException('Timeframe is required', HttpStatus.BAD_REQUEST);
    }
    if (!request.strategy) {
      throw new HttpException('Strategy is required', HttpStatus.BAD_REQUEST);
    }

    // Get strategy
    const strategy = getStrategy(request.strategy);
    if (!strategy) {
      throw new HttpException(
        `Unknown strategy: ${request.strategy}. Use GET /backtest/strategies for available options.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Initialize strategy with params
    if (request.strategyParams && strategy.init) {
      strategy.init(request.strategyParams);
    }

    // Fetch candle data
    const candles = await this.candleService
      .fetchCandles({
        symbol: request.symbol.toUpperCase(),
        timeframe: request.timeframe,
        startTime: request.startTime,
        endTime: request.endTime,
      })
      .toPromise();

    if (candles.length < 50) {
      throw new HttpException(
        'Insufficient candle data. Need at least 50 candles for backtesting.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Configure backtest
    const config: BacktestConfig = {
      symbol: request.symbol.toUpperCase(),
      timeframe: request.timeframe,
      startTime: request.startTime,
      endTime: request.endTime,
      initialCapital: request.initialCapital || 10000,
      positionSizePercent: request.positionSizePercent || 95,
      commission: request.commission || 0.001, // 0.1% default
      slippage: request.slippage || 0.0005, // 0.05% default
    };

    // Run backtest
    const result = this.backtestService.runBacktest(candles, strategy, config);

    // Return summary (exclude full equity curve for brevity)
    return {
      config: result.config,
      metrics: result.metrics,
      totalTrades: result.trades.length,
      trades: result.trades.slice(-20), // Last 20 trades
      summary: this.backtestService.formatResults(result),
    };
  }

  /**
   * Run a backtest with full results (including equity curve)
   */
  @Post('run/full')
  async runBacktestFull(@Body() request: BacktestRequest) {
    // Validate required fields
    if (!request.symbol) {
      throw new HttpException('Symbol is required', HttpStatus.BAD_REQUEST);
    }
    if (!request.timeframe) {
      throw new HttpException('Timeframe is required', HttpStatus.BAD_REQUEST);
    }
    if (!request.strategy) {
      throw new HttpException('Strategy is required', HttpStatus.BAD_REQUEST);
    }

    // Get strategy
    const strategy = getStrategy(request.strategy);
    if (!strategy) {
      throw new HttpException(
        `Unknown strategy: ${request.strategy}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Initialize strategy with params
    if (request.strategyParams && strategy.init) {
      strategy.init(request.strategyParams);
    }

    // Fetch candle data
    const candles = await this.candleService
      .fetchCandles({
        symbol: request.symbol.toUpperCase(),
        timeframe: request.timeframe,
        startTime: request.startTime,
        endTime: request.endTime,
      })
      .toPromise();

    if (candles.length < 50) {
      throw new HttpException(
        'Insufficient candle data. Need at least 50 candles for backtesting.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Configure backtest
    const config: BacktestConfig = {
      symbol: request.symbol.toUpperCase(),
      timeframe: request.timeframe,
      startTime: request.startTime,
      endTime: request.endTime,
      initialCapital: request.initialCapital || 10000,
      positionSizePercent: request.positionSizePercent || 95,
      commission: request.commission || 0.001,
      slippage: request.slippage || 0.0005,
    };

    // Run backtest
    return this.backtestService.runBacktest(candles, strategy, config);
  }

  /**
   * Compare multiple strategies
   */
  @Post('compare')
  async compareStrategies(
    @Body()
    request: {
      symbol: string;
      timeframe: Timeframe;
      strategies: string[];
      startTime?: number;
      endTime?: number;
      initialCapital?: number;
    },
  ) {
    if (!request.symbol || !request.timeframe || !request.strategies?.length) {
      throw new HttpException(
        'Symbol, timeframe, and strategies array are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Fetch candle data once
    const candles = await this.candleService
      .fetchCandles({
        symbol: request.symbol.toUpperCase(),
        timeframe: request.timeframe,
        startTime: request.startTime,
        endTime: request.endTime,
      })
      .toPromise();

    if (candles.length < 50) {
      throw new HttpException(
        'Insufficient candle data',
        HttpStatus.BAD_REQUEST,
      );
    }

    const config: BacktestConfig = {
      symbol: request.symbol.toUpperCase(),
      timeframe: request.timeframe,
      startTime: request.startTime,
      endTime: request.endTime,
      initialCapital: request.initialCapital || 10000,
      positionSizePercent: 95,
      commission: 0.001,
      slippage: 0.0005,
    };

    // Run backtest for each strategy
    const results = request.strategies.map((strategyName) => {
      const strategy = getStrategy(strategyName);
      if (!strategy) {
        return {
          strategy: strategyName,
          error: 'Unknown strategy',
        };
      }

      const result = this.backtestService.runBacktest(candles, strategy, config);
      return {
        strategy: strategyName,
        metrics: result.metrics,
      };
    });

    // Sort by total PnL
    results.sort((a: any, b: any) => {
      if (a.error) return 1;
      if (b.error) return -1;
      return b.metrics.totalPnl - a.metrics.totalPnl;
    });

    return {
      symbol: request.symbol.toUpperCase(),
      timeframe: request.timeframe,
      candleCount: candles.length,
      initialCapital: config.initialCapital,
      results,
    };
  }

  /**
   * Get available trading symbols
   */
  @Get('symbols')
  async getSymbols() {
    const symbols = await this.candleService.getAvailableSymbols().toPromise();
    return { count: symbols.length, symbols };
  }
}
