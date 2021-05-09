import { HttpModule, HttpService, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExchangeController } from './exchange/exchange.controller';
import { ExchangeService } from './exchange/exchange.service';
import { BitFlyerExchange } from './exchange/services/bitflyer.service';
import { BotConfigService } from './services/configs/botconfigs.service';
import { SecretsService } from './services/secrets/secrets.service';
import configuration from './services/configs/configurations';

@Module({
  imports: [
    HttpModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
  ],
  providers: [
    {
      provide: ExchangeService,
      useClass: BitFlyerExchange,
    },
    BotConfigService,
    SecretsService,
  ],
  controllers: [ExchangeController],
})
export class BitFlyer {}
