import { Body, Controller, Post, Get, UseInterceptors } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { BotRequest, OrderType } from './entities/exchange';
import { ExchangeService } from './exchange.service';
import { assertIsString, assertIsEmpty } from '../utils/helper';
import { ExchangeInterceptor } from '../guard/exchange.interceptor';

@Controller('exchange')
export class ExchangeController {
  constructor(private service: ExchangeService) {}

  @UseInterceptors(ExchangeInterceptor)
  @Post('sell')
  async makeSellOrder(@Body() botReq: BotRequest): Promise<any> {
    console.log(botReq);
    assertIsString(botReq.asset);
    assertIsString(botReq.denominator);
    return this.service.sell(
      botReq.asset.trim(),
      botReq.denominator.trim(),
      botReq.amount,
    );
  }

  @UseInterceptors(ExchangeInterceptor)
  @Post('buy')
  async makeBuyOrder(@Body() botReq: BotRequest): Promise<any> {
    console.log(botReq);
    assertIsString(botReq.asset);
    assertIsString(botReq.denominator);
    return this.service.buy(
      botReq.asset.trim(),
      botReq.denominator.trim(),
      OrderType.Market,
      botReq.amount,
    );
  }

  @UseInterceptors(ExchangeInterceptor)
  @Post('clear')
  clearOrders(@Body() botReq: BotRequest): Promise<any> {
    console.log(botReq);
    assertIsString(botReq.asset);
    assertIsString(botReq.denominator);
    return this.service.clear(botReq.asset.trim(), botReq.denominator.trim());
  }

  @UseInterceptors(ExchangeInterceptor)
  @Post('buythedip')
  async makeBuyDipOrders(@Body() botReq: BotRequest): Promise<any> {
    console.log(botReq);
    assertIsString(botReq.asset);
    assertIsString(botReq.denominator);
    assertIsEmpty(botReq.dip);
    return this.service.bidDips(
      botReq.asset.trim(),
      botReq.denominator.trim(),
      botReq.dip,
    );
  }

  @Get('health')
  health(): Observable<any> {
    return of({ status: 'OK' });
  }
}
