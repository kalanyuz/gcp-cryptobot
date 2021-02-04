import { HttpModule, HttpService, Module } from '@nestjs/common';
import { ExchangeController } from './exchange/exchange.controller';
import { ExchangeService } from './exchange/exchange.service';
// import { KrakenExchangeService } from './exchange/services/krakenExchange.service';

@Module({
  imports: [HttpModule],
  providers: [
    // {
    //   provide: ExchangeService,
    //   useClass: KrakenExchangeService,
    // },
  ],
  controllers: [ExchangeController],
})
export class AppModule {}
