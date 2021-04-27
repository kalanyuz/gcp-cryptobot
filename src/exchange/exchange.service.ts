import { Observable } from 'rxjs';
import { HttpService, Injectable } from '@nestjs/common';

@Injectable()
export abstract class ExchangeService {
  constructor(protected httpService: HttpService) {}

  abstract getPrice(pair: string): Observable<any>;
  abstract getBalance(pair: string): Observable<any>;
  abstract buy(
    pair: string,
    amount?: number,
    stopLoss?: number,
  ): Observable<any>;
  abstract sell(pair: string): Observable<any>;
  abstract clear(pair: string): Observable<any>;
}
