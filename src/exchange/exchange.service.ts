import { Observable } from 'rxjs';
import { HttpService, Injectable } from '@nestjs/common';
import { SecretsService } from '../services/secrets/secrets.service';

@Injectable()
export abstract class ExchangeService {
  constructor(
    protected httpService: HttpService,
    protected secretService: SecretsService,
  ) {}

  abstract getPrice(ofProduct: string, priceIn: string): Observable<any>;

  abstract getBalance(priceIn: string): Observable<any>;

  abstract buy(
    asset: string,
    using: string,
    amount?: number,
    stopLoss?: number,
  ): any;

  abstract sell(asset: string, sellFor: string, amount?: number): any;

  abstract clear(pair: string): Observable<any>;
}
