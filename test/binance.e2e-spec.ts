import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Binance } from '../src/binance.module';
import { SecretsService } from '../src/services/secrets/secrets.service';
import { BotRequest } from '../src/exchange/entities/exchange';
require('dotenv').config({ path: __dirname + '/.env' });

describe('AppController (e2e)', () => {
  let app: INestApplication;
  const secretsService = {
    getSecret: (secret: string, version: string = 'latest') => {
      return new Promise((res, rej) => {
        switch (secret) {
          case 'BINANCE_SECRET':
            res(process.env.BINANCE_SECRET);
            return;
          case 'BINANCE_APIKEY':
            res(process.env.BINANCE_APIKEY);
            return;
          default:
            rej();
        }
      });
    },
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [Binance],
    })
      .overrideProvider(SecretsService)
      .useValue(secretsService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/exchange/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/exchange/health')
      .expect(200)
      .expect({ status: 'OK' });
  });

  it('/buy (POST)', (done) => {
    return request(app.getHttpServer())
      .post('/exchange/buy')
      .send({
        asset: 'BTC',
        denominator: 'USDT',
        amount: 0.01,
      } as BotRequest)
      .expect(201)
      .end((err, res) => {
        if (err) {
          console.error(res.error);
        }
        done(err);
      });
  });

  it('/sell (POST)', (done) => {
    return request(app.getHttpServer())
      .post('/exchange/sell')
      .send({
        asset: 'ETH',
        denominator: 'BTC',
        amount: 0.01,
      } as BotRequest)
      .expect(201)
      .end((err, res) => {
        if (err) {
          console.error(res.error);
        }
        done(err);
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
