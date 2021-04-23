import { Test, TestingModule } from '@nestjs/testing';
import { BitFlyerExchange } from './bitflyer.service';
import { map, filter } from 'rxjs/operators';
import { from } from 'rxjs';
import { HttpModule } from '@nestjs/common';

describe('ExchangeService', () => {
  let service: BitFlyerExchange;

  const balance = from([
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
  ]);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [BitFlyerExchange],
    }).compile();

    service = module.get<BitFlyerExchange>(BitFlyerExchange);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should exclude currency', () => {
    const filtered = balance.pipe(
      filter((x) => {
        console.log(x);
        return ['JPY', 'BTC', 'ETH'].includes(x.currency_code);
      }),
    );
  });
});
