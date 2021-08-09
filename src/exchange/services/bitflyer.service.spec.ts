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
import { OrderType } from '../entities/exchange';

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
    balances: [
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
    process.env.CONFIGFILE = 'config.bitflyer.sample.yaml';
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

  it('should filter out balance that is 0', async (done) => {
    jest.spyOn(service, 'getPrice').mockReturnValue(
      of({
        amount: 0.02357742,
        currency_code: 'BTC',
      }),
    );
    jest.spyOn(httpClient, 'get').mockReturnValueOnce(of(balanceResponse));
    const result = of(await service.getBalance('BTC'));

    result.subscribe({
      next: (x) => {
        expect(x.balances).toMatchObject(allAsset.balances);
      },
      complete: () => done(),
    });
  });

  it('should correctly calculate output balance', async (done) => {
    jest.spyOn(service, 'getPrice').mockReturnValue(
      of({
        amount: 0.02357742,
        currency_code: 'BTC',
      }),
    );
    jest.spyOn(httpClient, 'get').mockReturnValueOnce(of(balanceResponse));
    const result = of(await service.getBalance('BTC'));

    result.subscribe({
      next: (x) => {
        expect(x.total).toMatchObject({
          amount: 0.07073226,
          currency_code: 'BTC',
        });
      },
      complete: () => done(),
    });
  });

  it('should find the amount of asset to sell when not specified', async () => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValue(allAsset);

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const result = await service.sell('BTC', 'JPY');

    expect(result).toEqual(orderResponse.data);
    expect(getBalance).toBeCalledWith('JPY');
    expect(getBalance).toBeCalledTimes(1);
  });

  it('should not find the amount of asset to sell when specified', async () => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValue('' as any);

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const result = await service.sell('BTC', 'JPY', 0.01);

    expect(result).toEqual(orderResponse.data);
    expect(getBalance).not.toBeCalled();
  });

  it('should throw when asset to sell is not found', async () => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValue(allAsset);

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const result = service.sell('DOGE', 'JPY');

    expect(getBalance).toBeCalledWith('JPY');
    expect(getBalance).toBeCalledTimes(1);
    await expect(result).rejects.toThrow(
      new HttpException(
        'Could not find an asset to sell.',
        HttpStatus.BAD_REQUEST,
      ),
    );
  });

  it('should find the amount of asset to buy when not specified', async () => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValue(allAsset);

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const result = await service.buy('ETH', 'BTC', OrderType.Market);

    expect(result).toEqual(orderResponse.data);
    expect(getBalance).toBeCalledWith('BTC');
    expect(getBalance).toBeCalledTimes(1);
  });

  it('should not find the amount of asset to buy when specified', async () => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValue('' as any);

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const result = await service.buy('DOGE', 'BTC', OrderType.Market, 0.01);

    expect(result).toEqual(orderResponse.data);
    expect(getBalance).not.toBeCalled();
  });

  it('should throw when asset to buy with is not found', async () => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValue(allAsset);

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const result = service.buy('BTC', 'DOGE', OrderType.Market);

    await expect(result).rejects.toThrow(
      new HttpException(
        'Could not calculate total available asset',
        HttpStatus.INTERNAL_SERVER_ERROR,
      ),
    );
    expect(getBalance).toBeCalledWith('DOGE');
    expect(getBalance).toBeCalledTimes(1);
  });

  it('should rebalance correctly when amount is not specified', async () => {
    jest.spyOn(service, 'getBalance').mockResolvedValue(allAsset);
    const buyRequest = jest
      .spyOn(httpClient, 'post')
      .mockReturnValueOnce(of(orderResponse));
    const result = await service.buy('ETH', 'BTC', OrderType.Market);

    expect(result).toEqual(orderResponse.data);
    expect(buyRequest).toHaveBeenCalledWith(
      expect.anything(),
      JSON.stringify({
        product_code: `ETH_BTC`,
        child_order_type: 'MARKET',
        side: 'BUY',
        size: '0.01768307',
        time_in_force: 'GTC',
      }),
      expect.anything(),
    );
  });

  it('should buy the dip', async () => {
    jest.spyOn(service, 'getPrice').mockReturnValue(
      of({
        amount: 50000,
        currency_code: 'JPY',
      }),
    );
    jest.spyOn(service, 'getBalance').mockResolvedValue(allAsset);
    const buyLimit = jest.spyOn(service, 'buy');
    jest.spyOn(httpClient, 'post').mockReturnValue(of(orderResponse));
    const dipBought = await service.bidDips('BTC', 'JPY', [
      {
        percent: 10,
        allocation: 10,
      },
      {
        percent: 20,
        allocation: 20,
      },
      {
        percent: 30,
        allocation: 40,
      },
    ]);

    expect(buyLimit).toBeCalledTimes(3);
    expect(buyLimit.mock.calls.map((item) => item[3])).toEqual([
      0.03858, 0.0868, 0.1984,
    ]);
    expect(buyLimit.mock.calls.map((item) => item[4])).toEqual([
      50000 * 0.9,
      50000 * 0.8,
      50000 * 0.7,
    ]);
    expect(dipBought).toEqual({ status: 200, data: 'OK' });
  });
});
