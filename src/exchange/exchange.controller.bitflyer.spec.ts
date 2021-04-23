import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeController } from './exchange.controller';
import { BitFlyerExchange } from './services/bitflyer.service';
import { ExchangeService } from './exchange.service';
import { HttpModule } from '@nestjs/common';

describe('ExchangeController', () => {
  let controller: ExchangeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExchangeController],
      imports: [HttpModule],
      providers: [
        {
          provide: ExchangeService,
          useClass: BitFlyerExchange,
        },
      ],
    }).compile();

    controller = module.get<ExchangeController>(ExchangeController);
  });

  it('should be defined', () => {
    expect(controller.makeSellOrder('empty')).resolves.toThrow(
      'Could not create sell order',
    );
  });
});
