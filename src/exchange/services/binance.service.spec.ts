import { Test, TestingModule } from '@nestjs/testing';
import { of, from } from 'rxjs';
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
import { BinanceExchange } from './binance.service';
import { OrderType } from '../entities/exchange';

describe('ExchangeService', () => {
  let service: BinanceExchange;
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
      symbol: 'BTCUSDT',
      orderId: 2763259,
      orderListId: -1,
      clientOrderId: 'my_order_id_1',
      transactTime: 1621122100613,
      price: '0.00000000',
      origQty: '0.01000000',
      executedQty: '0.00004200',
      cummulativeQuoteQty: '1.96040586',
      status: 'EXPIRED',
      timeInForce: 'GTC',
      type: 'MARKET',
      side: 'SELL',
      fills: [
        {
          price: '46676.33000000',
          qty: '0.00004200',
          commission: '0.00000000',
          commissionAsset: 'USDT',
          tradeId: 753445,
        },
      ],
    },
  };

  const balanceResponse = {
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {},
    data: {
      makerCommission: 0,
      takerCommission: 0,
      buyerCommission: 0,
      sellerCommission: 0,
      canTrade: true,
      canWithdraw: false,
      canDeposit: false,
      updateTime: 1620902925998,
      accountType: 'SPOT',
      balances: [
        {
          asset: 'BNB',
          free: '1000.00000000',
          locked: '50.00000000',
        },
        {
          asset: 'BTC',
          free: '0.99898700',
          locked: '0.00000000',
        },
        {
          asset: 'BUSD',
          free: '10000.00000000',
          locked: '0.00000000',
        },
        {
          asset: 'ETH',
          free: '100.00000000',
          locked: '0.00000000',
        },
        {
          asset: 'TRX',
          free: '0.00000000',
          locked: '0.00000000',
        },
        {
          asset: 'USDT',
          free: '10050.01638856',
          locked: '0.00000000',
        },
      ],
      permissions: ['SPOT'],
    },
  };

  const allAsset = {
    balances: [
      {
        currency_code: 'BNB',
        amount: 1050.0,
        available: 1000.0,
      },
      {
        currency_code: 'BTC',
        amount: 0.998987,
        available: 0.998987,
      },
      {
        currency_code: 'BUSD',
        amount: 10000.0,
        available: 10000.0,
      },
      {
        currency_code: 'ETH',
        amount: 100.0,
        available: 100.0,
      },
      {
        currency_code: 'USDT',
        amount: 10050.01638856,
        available: 10050.01638856,
      },
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
      symbol: 'BTCUSDT',
      price: '49663.56000000',
    },
  };

  beforeEach(async () => {
    process.env.CONFIGFILE = 'config.binance.sample.yaml';
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
        BinanceExchange,
        BotConfigService,
        { provide: SecretsService, useValue: secrets },
      ],
    }).compile();

    config = module.get<BotConfigService>(BotConfigService);
    httpClient = module.get<HttpService>(HttpService);
    service = new BinanceExchange(httpClient, config, secrets);
    jest.spyOn(service, 'getTime').mockResolvedValue(1621164085102);
  });

  /**
   * The key to making this test work is passing it the the done keyword, otherwise it will finish before the data is emitted.
   * https://fireship.io/snippets/testing-rxjs-observables-with-jest/
   */
  it('should extract price of a crypto', (done) => {
    jest.spyOn(httpClient, 'get').mockReturnValue(of(tickerBTC));
    const price = service.getPrice('BTC', 'USDT');

    price.subscribe({
      next: (x) => {
        expect(x).toMatchObject({
          amount: 49663.56,
          currency_code: 'USDT',
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
          symbol: 'BTCUSDA',
          price: '49663.56000000',
        },
      }),
    );
    const price = service.getPrice('BTC', 'USDT');

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
    const result = await service.getBalance('BTC');
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
    const result = from(await service.getBalance('BTC'));

    result.subscribe({
      next: (x) => {
        expect(x.total.amount).toBeCloseTo(1.09329668);
        expect(x.total.currency_code).toBe('BTC');
      },
      complete: () => done(),
    });
  });

  it('should find the amount of asset to sell when not specified', async (done) => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(of(allAsset));

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const result = await service.sell('BTC', 'USDT');

    expect(result).toEqual(orderResponse);
    expect(getBalance).toBeCalledWith('USDT');
    expect(getBalance).toBeCalledTimes(1);
    done();
  });

  it('should not find the amount of asset to sell when specified', async (done) => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(of('' as any));

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const result = await service.sell('BTC', 'USDT', 0.01);

    expect(result).toEqual(orderResponse);
    expect(getBalance).not.toBeCalled();
    done();
  });

  it('should throw when asset to sell is not found', async (done) => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(of(allAsset));

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const result = service.sell('SAFEMOON', 'USDT');

    expect(result).rejects.toThrow(
      new HttpException(
        'Could not find an asset to sell.',
        HttpStatus.BAD_REQUEST,
      ),
    );
    expect(getBalance).toBeCalledWith('USDT');
    expect(getBalance).toBeCalledTimes(1);
    done();
  });

  it('should find the amount of asset to buy when not specified', async (done) => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(of(allAsset));

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const result = await service.buy('ETH', 'BTC');

    expect(result).toEqual(orderResponse);
    expect(getBalance).toBeCalledWith('BTC');
    expect(getBalance).toBeCalledTimes(1);
    done();
  });

  it('should not find the amount of asset to buy when specified', async (done) => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(of(allAsset));

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const result = await service.buy('DOGE', 'BTC', OrderType.Market, 0.01);

    expect(result).toEqual(orderResponse);
    expect(getBalance).not.toBeCalled();
    done();
  });

  it('should throw when asset to buy with is not found', async (done) => {
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(of(allAsset));

    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const result = service.buy('BTC', 'DOGE');

    expect(result).rejects.toThrow(
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
    jest.spyOn(service, 'getBalance').mockResolvedValueOnce(of(allAsset));
    const buyRequest = jest
      .spyOn(httpClient, 'post')
      .mockReturnValueOnce(of(orderResponse));
    const result = await service.buy('ETH', 'BTC');

    expect(result).toEqual(orderResponse);

    expect(buyRequest).toHaveBeenCalledWith(
      expect.stringContaining('symbol=ETHBTC&side=BUY&type=MARKET&quantity='),
      null,
      expect.anything(),
    );
    done();
  });
});
