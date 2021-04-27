import { Test, TestingModule } from '@nestjs/testing';
import { BitFlyerExchange } from './bitflyer.service';
import { map, filter } from 'rxjs/operators';
import { from, of } from 'rxjs';
import { HttpModule, HttpService } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from '../../services/configs/configurations';
import { BotConfigService } from '../../services/configs/botconfigs.service';

describe('ExchangeService', () => {
  let service: BitFlyerExchange;
  let httpClient: HttpService;
  let config: BotConfigService;

  const response = {
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {},
    data: [
      { currency_code: 'JPY', amount: 42260, available: 17360 },
      { currency_code: 'BTC', amount: 0.02357742, available: 0.02357742 },
      { currency_code: 'BCH', amount: 0, available: 0 },
      { currency_code: 'ETH', amount: 0.039944, available: 0.039944 },
      { currency_code: 'ETC', amount: 0, available: 0 },
      { currency_code: 'LTC', amount: 0, available: 0 },
      { currency_code: 'MONA', amount: 0, available: 0 },
      { currency_code: 'LSK', amount: 0, available: 0 },
      { currency_code: 'XRP', amount: 0, available: 0 },
      { currency_code: 'BAT', amount: 0, available: 0 },
      { currency_code: 'XLM', amount: 0, available: 0 },
      { currency_code: 'XEM', amount: 0, available: 0 },
      { currency_code: 'XTZ', amount: 0, available: 0 },
    ],
  };

  const ticker = from([
    {
      product_code: 'BTC_JPY',
      state: 'RUNNING',
      timestamp: '2021-04-27T10:58:42.25',
      tick_id: 12384084,
      best_bid: 5931540,
      best_ask: 5934050,
      best_bid_size: 0.1278,
      best_ask_size: 0.00148002,
      total_bid_depth: 465.88439264,
      total_ask_depth: 814.21740351,
      market_bid_size: 0,
      market_ask_size: 0,
      ltp: 5934097,
      volume: 6827.70964118,
      volume_by_product: 4571.48797195,
    },
  ]);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        HttpModule,
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
        }),
      ],
      providers: [BitFlyerExchange, BotConfigService],
    }).compile();

    config = module.get<BotConfigService>(BotConfigService);
    httpClient = module.get<HttpService>(HttpService);
    service = new BitFlyerExchange(httpClient, config);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should get filtered balance', async () => {
    const httpGet = jest
      .spyOn(httpClient, 'get')
      .mockReturnValueOnce(of(response));

    const filtered = service.getBalance().toPromise();
    expect(filtered).resolves.toEqual([
      { currency_code: 'JPY', amount: 42260, available: 17360 },
      { currency_code: 'BTC', amount: 0.02357742, available: 0.02357742 },
      { currency_code: 'ETH', amount: 0.039944, available: 0.039944 },
    ]);
  });
});
