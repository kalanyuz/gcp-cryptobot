import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeController } from './exchange.controller';
import { BitFlyerExchange } from './services/bitflyer.service';
import { ExchangeService } from './exchange.service';
import { HttpModule, HttpService } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from '../services/configs/configurations';
import { BotConfigService } from '../services/configs/botconfigs.service';
import { SecretsService } from '../services/secrets/secrets.service';
import { of } from 'rxjs';
import { BotRequest, OrderType } from './entities/exchange';

describe('ExchangeController', () => {
  let controller: ExchangeController;
  let service: BitFlyerExchange;
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

  const dipReq: BotRequest = {
    asset: 'BTC',
    denominator: 'JPY',
    dip: [
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

  const orderResponse = {
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {},
    data: {
      child_order_acceptance_id: 'JRF20150707-050237-639234',
    },
  };

  beforeEach(async () => {
    process.env.CONFIGFILE = 'config.bitflyer.sample.yaml';
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
          useClass: BitFlyerExchange,
        },
        BotConfigService,
        { provide: SecretsService, useValue: secrets },
      ],
    }).compile();

    config = module.get<BotConfigService>(BotConfigService);
    httpClient = module.get<HttpService>(HttpService);
    service = new BitFlyerExchange(httpClient, config, secrets);
    controller = new ExchangeController(service);
  });

  it('Should throw when buy parameter type is not correct', async () => {
    const result = controller.makeBuyOrder({
      asset: undefined,
      denominator: undefined,
    } as any);
    expect(result).rejects.toThrow();
  });

  it('Should throw when sell parameter type is not correct', async () => {
    const result = controller.makeSellOrder({
      asset: undefined,
      denominator: undefined,
    } as any);
    expect(result).rejects.toThrow();
  });

  it('Should buy correctly when amount is undefined', async () => {
    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(allAsset);
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
  });

  it('Should buy correctly when amount is defined', async () => {
    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(allAsset);
    const buyService = jest.spyOn(service, 'buy');
    let botRegWithAmount = Object.assign({}, botReq);
    botRegWithAmount.amount = 2;
    const response = await controller.makeBuyOrder(botRegWithAmount);

    expect(getBalance).not.toBeCalled();
    expect(buyService).toBeCalledWith('ETH', 'BTC', OrderType.Market, 2);
    expect(response).toEqual(orderResponse.data);
  });

  it('Should sell correctly when amount is undefined', async () => {
    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(allAsset);
    const sellService = jest.spyOn(service, 'sell');
    const response = await controller.makeSellOrder(botReq);

    expect(getBalance).toBeCalledWith('BTC');
    expect(sellService).toBeCalledWith('ETH', 'BTC', undefined);
    expect(response).toEqual(orderResponse.data);
  });

  it('Should sell correctly when amount is defined', async () => {
    jest.spyOn(httpClient, 'post').mockReturnValueOnce(of(orderResponse));
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(allAsset);
    const sellService = jest.spyOn(service, 'sell');
    let botRegWithAmount = Object.assign({}, botReq);
    botRegWithAmount.amount = 2;
    const response = await controller.makeSellOrder(botRegWithAmount);

    expect(getBalance).not.toBeCalled();
    expect(sellService).toBeCalledWith('ETH', 'BTC', 2);
    expect(response).toEqual(orderResponse.data);
  });

  it('Should buy the dip', async () => {
    jest.spyOn(httpClient, 'post').mockReturnValue(of(orderResponse));
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(allAsset);
    jest.spyOn(service, 'getPrice').mockReturnValue(
      of({
        amount: 50000,
        currency_code: 'JPY',
      }),
    );
    const buyService = jest.spyOn(service, 'bidDips');
    const clearOrders = jest.spyOn(service, 'clear');
    const response = await controller.makeBuyDipOrders(dipReq);

    expect(getBalance).toBeCalled();
    expect(clearOrders).toBeCalledTimes(1);
    expect(buyService).toBeCalledWith(
      dipReq.asset,
      dipReq.denominator,
      dipReq.dip,
    );
    expect(response).toEqual({ status: 200, data: 'OK' });
  });

  it('Should not buy the dip when requests are failing', async () => {
    jest.spyOn(httpClient, 'post').mockReturnValue(of(orderResponse));
    const getBalance = jest
      .spyOn(service, 'getBalance')
      .mockResolvedValueOnce(allAsset);
    jest.spyOn(service, 'getPrice').mockImplementation(() => {
      throw new Error('');
    });
    const buyService = jest.spyOn(service, 'bidDips');
    const clearOrders = jest.spyOn(service, 'clear');
    await expect(controller.makeBuyDipOrders(dipReq)).rejects.toThrow();

    expect(getBalance).toBeCalled();
    expect(clearOrders).toBeCalledTimes(2);
    expect(buyService).toBeCalledWith(
      dipReq.asset,
      dipReq.denominator,
      dipReq.dip,
    );
  });

  it('Should not buy the dip when request is wrong', async () => {
    let failDipReq = Object.assign({}, dipReq);
    failDipReq.dip = [];
    await expect(controller.makeBuyDipOrders(failDipReq)).rejects.toThrow();
  });
});
