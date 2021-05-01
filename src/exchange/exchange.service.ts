import { Observable } from 'rxjs';
import { HttpService, Injectable } from '@nestjs/common';

@Injectable()
export abstract class ExchangeService {
  constructor(protected httpService: HttpService) {}

  abstract getPrice(ofProduct: string, priceIn: string): Observable<any>;

  abstract getBalance(priceIn: string): Observable<any>;

  abstract buy(
    pair: string,
    amount?: number,
    stopLoss?: number,
  ): Observable<any>;

  abstract sell(
    asset: string,
    sellFor: string,
    amount?: number,
  ): Promise<Observable<any>>;

  abstract clear(pair: string): Observable<any>;
}
