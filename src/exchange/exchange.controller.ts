import { Controller } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Configs } from '../services/entities/configs';
import { ExchangeService } from './exchange.service';

@Controller('exchange')
export class ExchangeController {
  constructor(private configs: ConfigService) {
    const pairs = configs.get('configurations');
    console.log(pairs);
  }
}
