import {
  HttpException,
  HttpService,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { map, filter, mergeMap, combineAll, toArray } from 'rxjs/operators';
import { BotConfigService } from '../../services/configs/botconfigs.service';
import { combineLatest, Observable, of, zip } from 'rxjs';
import { ExchangeService } from '../exchange.service';
import * as crypto from 'crypto';

@Injectable()
export class BitFlyerExchange extends ExchangeService {
  baseURL: string = 'https://api.bitflyer.com';
  key: string = '';
  secret: string = '';

  constructor(httpService: HttpService, private configs: BotConfigService) {
    super(httpService);
    if (configs.rebalanceTo !== 'JPY') {
      throw new HttpException(
        'BitFlyer module currently supports only JPY based trading pairs',
        HttpStatus.EXPECTATION_FAILED,
      );
    }
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

  getPrice(): Observable<any> {
    const path = '/v1/ticker';
    const response = this.httpService.get(`${this.baseURL}${path}`);
    const price = response.pipe(
      mergeMap((x) => x.data),
      // map(),
    );
    return of([]);
  }

  getBalance(): Observable<any> {
    const path = '/v1/me/getbalance';
    const signature = this.createSignature('GET', path);
    const response = this.httpService.get(`${this.baseURL}${path}`, {
      headers: signature,
    });

    const balance = response.pipe(
      mergeMap((x) => x.data),
      filter((x) => x['amount'] > 0),
      toArray(),
    );

    return balance;
  }

  buy(pair: string, amount?: number, stopLoss?: number): Observable<any> {
    /* get balance, compute total asset, allocate */
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
    const signature = this.createSignature('POST', path, requestBody);
    const response = this.httpService.post(this.baseURL + path, requestBody, {
      headers: signature,
    });
    return response;
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
