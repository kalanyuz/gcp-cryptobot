import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TradingViewGuard } from './guard/tradingview.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalGuards(new TradingViewGuard());
  await app.listen(process.env.PORT);
}
bootstrap();
