import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TradingViewGuard } from './guard/tradingview.guard';
import 'source-map-support/register';

const GUARDS = ['tradingview', 'none'].map((guard) => guard.toLowerCase());
const GUARD_ERROR = `Authorization guard not specified. Set GUARD env variable to one of: ${GUARDS.toString()}`;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
}
bootstrap();
