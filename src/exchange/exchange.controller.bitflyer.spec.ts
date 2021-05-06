import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeController } from './exchange.controller';
import { BitFlyerExchange } from './services/bitflyer.service';
import { ExchangeService } from './exchange.service';
import { HttpModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from '../services/configs/configurations';
import { BotConfigService } from '../services/configs/botconfigs.service';
import { SecretsService } from '../services/secrets/secrets.service';

describe('ExchangeController', () => {
  let controller: ExchangeController;
  let secrets: any;

  beforeEach(async () => {
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

    // controller = module.get<ExchangeController>(ExchangeController);
  });

  it('should be defined', () => {
    // expect(controller.makeSellOrder('empty')).resolves.toThrow(
    //   'Could not create sell order',
    // );
  });
});
