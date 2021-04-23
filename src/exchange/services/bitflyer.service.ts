import { HttpService, Injectable } from '@nestjs/common';
import { combineLatest, Observable, zip } from 'rxjs';
import { ExchangeService } from '../exchange.service';
import { map, filter, mergeMap, combineAll, toArray } from 'rxjs/operators';
import * as crypto from 'crypto';

@Injectable()
export class BitFlyerExchange extends ExchangeService {
  baseURL: string = 'https://api.bitflyer.com';
  key: string;
  secret: string;

  constructor(httpService: HttpService) {
    super(httpService);
    // TODO: Add secret manager
  }

  private createSignature(method: string, path: string, body?: string): any {
    const timestamp = Date.now().toString();
    const bodyString = body ?? '';
    const text = timestamp + method + path + bodyString;
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(text)
      .digest('hex');

    return {
      'ACCESS-KEY': this.key,
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-SIGN': signature,
    };
  }

  protected getBalance(): Observable<any> {
    const path = '/v1/me/getbalance';
    const signature = this.createSignature('GET', path);
    const response = this.httpService.get(`${this.baseURL}/v1/me/getbalance`, {
      headers: signature,
    });
    // TODO: load currency of interests from configuration file
    const balance = response.pipe(
      mergeMap((x) => x.data),
      filter((x) => {
        return ['JPY', 'BTC', 'ETH'].includes(x['currency_code']);
      }),
      toArray(),
    );

    return balance;
  }

  buy(pair: string, amount?: number, stopLoss?: number): Observable<any> {
    return new Observable();
  }

  sell(pair: string): Observable<any> {
    const path = '/v1/me/sendchildorder';
    const requestBody = JSON.stringify({
      product_code: pair,
      child_order_type: 'MARKET',
      side: 'SELL',
      size: 0,
      time_in_force: 'GTC',
    });
    // const signature = this.createSignature('POST', path, requestBody);
    // const response = this.httpService.post(this.baseURL + path, requestBody, {
    //   headers: signature,
    // });
    const balance = this.getBalance();
    return balance;
    // return response;
  }

  clear(pair: string): Observable<any> {
    const path = '/v1/me/cancelallchildorders';
    const requestBody = JSON.stringify({
      product_code: pair,
    });
    const signature = this.createSignature('POST', path, requestBody);
    const response = this.httpService.post(this.baseURL + path, requestBody, {
      headers: signature,
    });

    return response;
  }
}
