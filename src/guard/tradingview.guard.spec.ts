import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { TradingViewGuard } from './tradingview.guard';

describe('TradingViewGuard', () => {
  let service: TradingViewGuard;
  let context: ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TradingViewGuard],
    }).compile();

    service = module.get<TradingViewGuard>(TradingViewGuard);
    // mocks the execution context with correct ip address
    let request = {
      headers: {
        'x-forwarded-for': '52.32.178.7',
      },
    } as any;
    let getRequestMock = jest.fn(() => request);
    context = {
      switchToHttp: () => ({
        getRequest: getRequestMock,
      }),
    } as any;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should deny weird ipaddress(es)', () => {
    expect(service.checkAllowedAddress('0')).toBeFalsy();
    expect(service.checkAllowedAddress('')).toBeFalsy();
  });

  it('should accept allowed ipaddress(es)', () => {
    expect(service.canActivate(context)).toBeTruthy();
  });
});
