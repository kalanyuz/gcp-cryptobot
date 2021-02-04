import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeController } from './exchange.controller';

describe('ExchangeController', () => {
  let controller: ExchangeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExchangeController],
    }).compile();

    controller = module.get<ExchangeController>(ExchangeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
