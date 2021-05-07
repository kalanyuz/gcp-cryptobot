import { Body, Controller, Get } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { BotRequest } from './entities/exchange';
import { ExchangeService } from './exchange.service';
import { assertIsString } from '../utils/helper';

@Controller('exchange')
export class ExchangeController {
  constructor(private service: ExchangeService) {}

  @Get('sell')
  async makeSellOrder(@Body() botReq: BotRequest): Promise<Observable<any>> {
    assertIsString(botReq.asset);
    assertIsString(botReq.denominator);
    return this.service.sell(botReq.asset, botReq.denominator, botReq.amount);
  }

  @Get('buy')
  async makeBuyOrder(@Body() botReq: BotRequest): Promise<Observable<any>> {
    assertIsString(botReq.asset);
    assertIsString(botReq.denominator);
    return this.service.buy(botReq.asset, botReq.denominator, botReq.amount);
  }
}
