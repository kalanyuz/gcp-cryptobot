import { Observable } from 'rxjs';
import { HttpService, Injectable } from '@nestjs/common';
import { SecretsService } from '../services/secrets/secrets.service';
import { Dip, OrderType } from './entities/exchange';

@Injectable()
export abstract class ExchangeService {
  constructor(
    protected httpService: HttpService,
    protected secretService: SecretsService,
  ) {}

  abstract getPrice(ofProduct: string, priceIn: string): Observable<any>;

  abstract getBalance(priceIn: string): any;

  abstract buy(
    asset: string,
    using: string,
    mode?: OrderType,
    amount?: number,
    price?: number,
  ): any;

  abstract sell(asset: string, sellFor: string, amount?: number): any;

  abstract bidDips?(asset: string, using: string, dipConfig: Dip[]): any;

  abstract clear(asset: string, denominator: string): any;
}
