import { Test, TestingModule } from '@nestjs/testing';
import { BitFlyerExchange } from './bitflyer.service';
import { of } from 'rxjs';
import {
  HttpModule,
  HttpService,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
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
    ],
  };

  const tickerBTC = {
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {},
    data: {
      product_code: 'BTC_JPY',
      state: 'RUNNING',
      timestamp: '2021-04-27T10:58:42.25',
      tick_id: 12384084,
      best_bid: 5931540,
      best_ask: 5934050,
    },
  };

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

  /**
   * The key to making this test work is passing it the the done keyword, otherwise it will finish before the data is emitted.
   * https://fireship.io/snippets/testing-rxjs-observables-with-jest/
   */
  it('should extract price of a crypto', (done) => {
    jest.spyOn(httpClient, 'get').mockReturnValue(of(tickerBTC));
    const price = service.getPrice('BTC', 'JPY');

    price.subscribe({
      next: (x) => {
        expect(x).toMatchObject({
          amount: 5932795,
          currency_code: 'JPY',
        });
      },
      complete: () => done(),
    });
  });

  it('should reject when price data is incorrect', (done) => {
    jest.spyOn(httpClient, 'get').mockReturnValue(
      of({
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
        data: {
          product_code: 'BTC_JPY',
          best_bid: undefined,
          best_ask: 5934050,
        },
      }),
    );
    const price = service.getPrice('BTC', 'JPY');

    price.subscribe({
      complete: () => done(),
      error: (error) => {
        expect(error).toMatchObject(
          new HttpException('Failed to get price info', HttpStatus.BAD_REQUEST),
        );
        done();
      },
    });
  });

  it('should filter out balance that is 0', (done) => {
    jest.spyOn(service, 'getPrice').mockReturnValue(
      of({
        amount: 0.02357742,
        currency_code: 'BTC',
      }),
    );
    jest.spyOn(httpClient, 'get').mockReturnValueOnce(of(response));
    const filtered = service.getBalance('BTC');

    filtered.subscribe({
      next: (x) => {
        expect(x.balance).toMatchObject([
          { currency_code: 'JPY', amount: 42260, available: 17360 },
          { currency_code: 'BTC', amount: 0.02357742, available: 0.02357742 },
          { currency_code: 'ETH', amount: 0.039944, available: 0.039944 },
        ]);
      },
      complete: () => done(),
    });
  });

  it('should correctly calculate output balance', (done) => {
    jest.spyOn(service, 'getPrice').mockReturnValue(
      of({
        amount: 0.02357742,
        currency_code: 'BTC',
      }),
    );
    jest.spyOn(httpClient, 'get').mockReturnValueOnce(of(response));
    const filtered = service.getBalance('BTC');

    filtered.subscribe({
      next: (x) => {
        expect(x.total).toMatchObject({
          amount: 0.07073226,
          currency_code: 'BTC',
        });
      },
      complete: () => done(),
    });
  });
});
