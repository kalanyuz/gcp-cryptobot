import { HttpModule, HttpService, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExchangeController } from './exchange/exchange.controller';
import { ExchangeService } from './exchange/exchange.service';
import configuration from './services/configurations';
// import { KrakenExchangeService } from './exchange/services/krakenExchange.service';

@Module({
  imports: [
    HttpModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
  ],
  // providers: [
  //   // {
  //   //   provide: ExchangeService,
  //   //   useClass: KrakenExchangeService,
  //   // },
  // ],
  controllers: [ExchangeController],
})
export class AppModule {}
