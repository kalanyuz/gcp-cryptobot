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

  get rebalanceProfiles(): string[] {
    const rebalanceProfiles = this.configs.get<string[]>(
      'configurations.rebalance',
    );
    return rebalanceProfiles;
  }

  get tradeCurrency(): string {
    const rebalanceTo = this.configs.get<string>('configurations.trade_with');
    return rebalanceTo;
  }

  get tradingPairs(): string[] {
    const pairs = this.configs.get<string[]>('configurations.trading_pairs');
    return pairs;
  }
}
