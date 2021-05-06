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
import { SecretsService } from '../../services/secrets/secrets.service';

describe('ExchangeService', () => {
  let service: BitFlyerExchange;
  let httpClient: HttpService;
  let secrets: any;
  let config: BotConfigService;

  /**
   * response data definition
   */
  const orderResponse = {
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {},
    data: {
      child_order_acceptance_id: 'JRF20150707-050237-639234',
    },
  };

  const balanceResponse = {
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

  const allAsset = {
    balance: [
      { currency_code: 'JPY', amount: 42260, available: 17360 },
      { currency_code: 'BTC', amount: 0.02357742, available: 0.02357742 },
      { currency_code: 'ETH', amount: 0.039944, available: 0.039944 },
    ],
    total: {
      amount: 0.07073226,
      currency_code: 'BTC',
    },
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
    secrets = {
      getSecret: jest.fn().mockResolvedValue('huh?'),
    };
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        HttpModule,
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
        }),
      ],
      providers: [
        BitFlyerExchange,
        BotConfigService,
        { provide: SecretsService, useValue: secrets },
      ],
    }).compile();

    config = module.get<BotConfigService>(BotConfigService);
    httpClient = module.get<HttpService>(HttpService);

    service = new BitFlyerExchange(httpClient, config, secrets);
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
    jest.spyOn(httpClient, 'get').mockReturnValueOnce(of(balanceResponse));
    const filtered = service.getBalance('BTC');

    filtered.subscribe({
      next: (x) => {
        expect(x.balance).toMatchObject(allAsset.balance);
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
    jest.spyOn(httpClient, 'get').mockReturnValueOnce(of(balanceResponse));
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

  it('should find the amount of asset to sell when not specified', async (done) => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockReturnValue(of(allAsset));

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const filtered = await service.sell('BTC', 'JPY');

    filtered.subscribe({
      next: (x) => {
        expect(x).toEqual(orderResponse);
      },
      complete: () => done(),
    });
    expect(getBalance).toBeCalledWith('JPY');
    expect(getBalance).toBeCalledTimes(1);
  });

  it('should not find the amount of asset to sell when specified', async (done) => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockReturnValue(of(''));

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const filtered = await service.sell('BTC', 'JPY', 0.01);

    filtered.subscribe({
      next: (x) => {
        expect(x).toEqual(orderResponse);
      },
      complete: () => done(),
    });
    expect(getBalance).not.toBeCalled();
  });

  it('should throw when asset to sell is not found', async (done) => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockReturnValue(of(allAsset));

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const filtered = service.sell('DOGE', 'JPY');

    expect(filtered).rejects.toThrow(
      new HttpException(
        'Could not find an asset to sell.',
        HttpStatus.BAD_REQUEST,
      ),
    );
    expect(getBalance).toBeCalledWith('JPY');
    expect(getBalance).toBeCalledTimes(1);
    done();
  });

  it('should find the amount of asset to buy when not specified', async (done) => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockReturnValue(of(allAsset));

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const filtered = await service.buy('ETH', 'BTC');

    filtered.subscribe({
      next: (x) => {
        expect(x).toEqual(orderResponse);
      },
      complete: () => done(),
    });
    expect(getBalance).toBeCalledWith('BTC');
    expect(getBalance).toBeCalledTimes(1);
  });

  it('should not find the amount of asset to buy when specified', async (done) => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockReturnValue(of(''));

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const filtered = await service.buy('DOGE', 'BTC', 0.01);

    filtered.subscribe({
      next: (x) => {
        expect(x).toEqual(orderResponse);
      },
      complete: () => done(),
    });
    expect(getBalance).not.toBeCalled();
  });

  it('should throw when asset to buy with is not found', async (done) => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockReturnValue(of(allAsset));

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const filtered = service.buy('BTC', 'DOGE');

    expect(filtered).rejects.toThrow(
      new HttpException(
        'Could not calculate total available asset',
        HttpStatus.INTERNAL_SERVER_ERROR,
      ),
    );
    expect(getBalance).toBeCalledWith('DOGE');
    expect(getBalance).toBeCalledTimes(1);
    done();
  });

  it('should rebalance correctly when amount is not specified', async (done) => {
    jest.spyOn(service, 'getBalance').mockReturnValue(of(allAsset));
    const buyRequest = jest
      .spyOn(httpClient, 'post')
      .mockReturnValueOnce(of(orderResponse));
    const filtered = await service.buy('ETH', 'BTC');

    filtered.subscribe({
      next: (x) => {
        expect(x).toEqual(orderResponse);
      },
      complete: () => done(),
    });

    expect(buyRequest).toHaveBeenCalledWith(
      expect.anything(),
      JSON.stringify({
        product_code: `ETH_BTC`,
        child_order_type: 'MARKET',
        side: 'BUY',
        size: 0.017683065,
        time_in_force: 'GTC',
      }),
      expect.anything(),
    );
  });
});
