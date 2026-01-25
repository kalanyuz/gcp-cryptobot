import { HttpModule, Module } from '@nestjs/common';
import { BacktestController } from './backtest.controller';
import { CandleService } from './services/candle.service';
import { BacktestService } from './services/backtest.service';

@Module({
  imports: [HttpModule],
  controllers: [BacktestController],
  providers: [CandleService, BacktestService],
  exports: [CandleService, BacktestService],
})
export class BacktestModule {}
