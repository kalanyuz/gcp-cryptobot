import { NestFactory } from '@nestjs/core';
import { BitFlyer } from './bitflyer.module';
import { Binance } from './binance.module';
import { TradingViewGuard } from './guard/tradingview.guard';
import 'source-map-support/register';

const GUARDS = ['tradingview', 'none'].map((guard) => guard.toLowerCase());
const EXCHANGES = ['bitflyer', 'binance'];
const GUARD_ERROR = `Authorization guard not specified. Set GUARD env variable to one of: ${GUARDS.toString()}`;
const EXCHANGE_ERROR = `Exchange not specified. Set EXCHANGE env variable to one of: ${EXCHANGES.toString()}`;

async function bootstrap() {
  let module: any;
  switch (process.env.EXCHANGE.toLowerCase()) {
    case 'bitflyer':
      module = BitFlyer;
      break;
    case 'binance':
      module = Binance;
    default:
      throw new Error(EXCHANGE_ERROR);
  }
  const app = await NestFactory.create(module);
  switch (process.env.GUARD.toLowerCase()) {
    case 'tradingview':
      app.useGlobalGuards(new TradingViewGuard());
      break;
    case 'none':
      break;
    default:
      throw new Error(GUARD_ERROR);
  }
  await app.listen(process.env.PORT);
  console.log('Bot is running');
  console.log(`
  exchange:${process.env.EXCHANGE}
  guards: ${process.env.GUARD}
  `);
}
bootstrap();
