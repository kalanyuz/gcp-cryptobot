import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ExchangeService } from './exchange.service';

@Controller('exchange')
export class ExchangeController {
  constructor(private service: ExchangeService) {}

  @Get('sell')
  async makeSellOrder(@Body() body: any): Promise<Observable<any>> {
    return this.service.sell('JPY', 'BTC');
  }
}
