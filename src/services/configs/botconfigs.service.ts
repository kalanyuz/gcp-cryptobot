import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Configs, TradingPairs } from '../entities/configs';

@Injectable()
export class BotConfigService {
  private readonly client;
  constructor(private configs: ConfigService) {}

  get settings(): Configs {
    return this.configs.get<Configs>('configurations');
  }

  get rebalance(): boolean {
    const isRebalance = this.configs.get<boolean>('configurations.rebalance');
    return isRebalance;
  }

  get rebalanceTo(): string {
    const rebalanceTo = this.configs.get<string>('configurations.rebalance_to');
    return rebalanceTo;
  }

  get tradingPairs(): any {
    const pairs = this.configs.get<string>('configurations.trading_pairs');
    return pairs;
  }
}
