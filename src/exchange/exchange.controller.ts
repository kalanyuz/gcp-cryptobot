import { Body, Controller, Post, Get, UseInterceptors } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { BotRequest } from './entities/exchange';
import { ExchangeService } from './exchange.service';
import { assertIsString } from '../utils/helper';
import { ExchangeInterceptor } from '../guard/exchange.interceptor';

@Controller('exchange')
export class ExchangeController {
  constructor(private service: ExchangeService) {}

  @UseInterceptors(ExchangeInterceptor)
  @Post('sell')
  async makeSellOrder(@Body() botReq: BotRequest): Promise<any> {
    assertIsString(botReq.asset);
    assertIsString(botReq.denominator);
    return this.service.sell(botReq.asset, botReq.denominator, botReq.amount);
  }

  @UseInterceptors(ExchangeInterceptor)
  @Post('buy')
  async makeBuyOrder(@Body() botReq: BotRequest): Promise<any> {
    assertIsString(botReq.asset);
    assertIsString(botReq.denominator);
    return this.service.buy(botReq.asset, botReq.denominator, botReq.amount);
  }

  @UseInterceptors(ExchangeInterceptor)
  @Post('clear')
  clearOrders(@Body() botReq: BotRequest): Promise<any> {
    assertIsString(botReq.asset);
    assertIsString(botReq.denominator);
    return this.service.clear(botReq.asset, botReq.denominator);
  }

  @Get('health')
  health(): Observable<any> {
    return of({ status: 'OK' });
  }
}
