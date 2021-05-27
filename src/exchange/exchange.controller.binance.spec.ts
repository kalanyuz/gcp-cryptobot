import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeController } from './exchange.controller';
import { ExchangeService } from './exchange.service';
import { HttpModule, HttpService } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from '../services/configs/configurations';
import { BotConfigService } from '../services/configs/botconfigs.service';
import { SecretsService } from '../services/secrets/secrets.service';
import { of } from 'rxjs';
import { BotRequest, OrderType } from './entities/exchange';
import { BinanceExchange } from './services/binance.service';

describe('ExchangeController', () => {
  let controller: ExchangeController;
  let service: BinanceExchange;
  let httpClient: HttpService;
  let secrets: any;
  let config: BotConfigService;

  const botReq: BotRequest = {
    asset: 'ETH',
    denominator: 'BTC',
    amount: undefined,
    price: undefined,
    time: undefined,
  };

  const allAsset = {
    balances: [
      { currency_code: 'USDT', amount: 42260, available: 17360 },
      { currency_code: 'BTC', amount: 0.02357742, available: 0.02357742 },
      { currency_code: 'ETH', amount: 0.039944, available: 0.039944 },
    ],
    total: {
      amount: 0.07073226,
      currency_code: 'BTC',
    },
  };

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

  beforeEach(async () => {
    process.env.CONFIGFILE = 'config.binance.sample.yaml';
    secrets = {
      getSecret: jest.fn().mockResolvedValue('huh?'),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExchangeController],
      imports: [
        HttpModule,
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
        }),
      ],
      providers: [
        {
          provide: ExchangeService,
          useClass: BinanceExchange,
        },
        BotConfigService,
        { provide: SecretsService, useValue: secrets },
      ],
    }).compile();

    config = module.get<BotConfigService>(BotConfigService);
    httpClient = module.get<HttpService>(HttpService);
    service = new BinanceExchange(httpClient, config, secrets);
    controller = new ExchangeController(service);
  });

  it('Should throw when buy parameter type is not correct', async (done) => {
    const result = controller.makeBuyOrder({
      asset: undefined,
      denominator: undefined,
    } as any);
    expect(result).rejects.toThrow();
    done();
  });

  it('Should throw when sell parameter type is not correct', async (done) => {
    const result = controller.makeSellOrder({
      asset: undefined,
      denominator: undefined,
    } as any);
    expect(result).rejects.toThrow();
    done();
  });

  it('Should buy correctly when amount is undefined', async (done) => {
    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(of(allAsset));
    const buyService = jest.spyOn(service, 'buy');
    const response = await controller.makeBuyOrder(botReq);

    expect(getBalance).toBeCalledWith('BTC');
    expect(buyService).toBeCalledWith(
      'ETH',
      'BTC',
      OrderType.Market,
      undefined,
    );
    expect(response).toEqual(orderResponse.data);
    done();
  });

  it('Should buy correctly when amount is defined', async (done) => {
    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(of(allAsset));
    const buyService = jest.spyOn(service, 'buy');
    let botRegWithAmount = Object.assign({}, botReq);
    botRegWithAmount.amount = 2;
    const response = await controller.makeBuyOrder(botRegWithAmount);

    expect(getBalance).not.toBeCalled();
    expect(buyService).toBeCalledWith('ETH', 'BTC', OrderType.Market, 2);
    expect(response).toEqual(orderResponse.data);
    done();
  });

  it('Should sell correctly when amount is undefined', async (done) => {
    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(of(allAsset));
    const sellService = jest.spyOn(service, 'sell');
    const response = await controller.makeSellOrder(botReq);

    expect(getBalance).toBeCalledWith('BTC');
    expect(sellService).toBeCalledWith('ETH', 'BTC', undefined);
    expect(response).toEqual(orderResponse.data);
    done();
  });

  it('Should sell correctly when amount is defined', async (done) => {
    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(of(allAsset));
    const sellService = jest.spyOn(service, 'sell');
    let botRegWithAmount = Object.assign({}, botReq);
    botRegWithAmount.amount = 2;
    const response = await controller.makeSellOrder(botRegWithAmount);

    expect(getBalance).not.toBeCalled();
    expect(sellService).toBeCalledWith('ETH', 'BTC', 2);
    expect(response).toEqual(orderResponse.data);
    done();
  });
});
