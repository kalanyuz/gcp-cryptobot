import {
  HttpException,
  HttpService,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import {
  map,
  filter,
  mergeMap,
  toArray,
  concatMap,
  reduce,
  catchError,
} from 'rxjs/operators';
import { BotConfigService } from '../../services/configs/botconfigs.service';
import { config, Observable, of, throwError } from 'rxjs';
import { ExchangeService } from '../exchange.service';
import * as crypto from 'crypto';
import { forkJoin } from 'rxjs';
import { SecretsService } from '../../services/secrets/secrets.service';
import {
  BitFlyerAsset,
  BitFlyerBalance,
  BitFlyerSignature,
} from './bitflyer.entities';

@Injectable()
export class BitFlyerExchange extends ExchangeService {
  baseURL: string = 'https://api.bitflyer.com';
  key: string = '';
  secret: string = '';

  constructor(
    httpService: HttpService,
    private configs: BotConfigService,
    secretService: SecretsService,
  ) {
    super(httpService, secretService);
    if (configs.tradeCurrency !== 'JPY') {
      throw new HttpException(
        'BitFlyer module currently supports only JPY based trading pairs',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const apiKeyName: string = configs.settings['api_keyname'];
    const secretKeyName: string = configs.settings['secret_keyname'];

    secretService
      .getSecret(apiKeyName)
      .then((key) => {
        this.key = key;
      })
      .catch((error) => console.error(error));

    secretService
      .getSecret(secretKeyName)
      .then((key) => {
        this.secret = key;
      })
      .catch((error) => console.error(error));
  }

  private createSignature(
    method: string,
    path: string,
    body?: string,
  ): BitFlyerSignature {
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

  getPrice(ofProduct: string, priceIn: string): Observable<BitFlyerAsset> {
    const path = '/v1/ticker';
    const response = this.httpService.get(`${this.baseURL}${path}`);
    const price = response.pipe(
      map((x) => x.data),
      map((x) => {
        if (x['product_code'] !== `${ofProduct}_${priceIn}`) {
          console.error(
            'Price info returned different from what is requested.',
          );
          throw new HttpException(
            'Failed to get price info',
            HttpStatus.EXPECTATION_FAILED,
          );
        }
        try {
          const price =
            (parseFloat(x['best_bid']) + parseFloat(x['best_ask'])) / 2.0;
          if (isNaN(price)) throw 'NaN';

          return {
            amount: price,
            currency_code: priceIn,
          };
        } catch {
          throw new HttpException(
            'Failed to get price info',
            HttpStatus.BAD_REQUEST,
          );
        }
      }),
      catchError((err) => {
        console.error(err.response.data);
        return throwError(err);
      }),
    );
    return price;
  }

  getBalance(priceIn: string): Observable<BitFlyerBalance> {
    const path = '/v1/me/getbalance';
    const signature = this.createSignature('GET', path);
    const response = this.httpService.get(`${this.baseURL}${path}`, {
      headers: signature,
    });

    const balances = response.pipe(
      mergeMap((x) => x.data),
      filter((x) => x['amount'] > 0),
      toArray<BitFlyerAsset>(),
      catchError((err) => {
        console.error(err.response.data);
        return throwError(err);
      }),
    );

    const total = balances.pipe(
      mergeMap((item) => item),
      concatMap((item) => {
        if (item['currency_code'] !== priceIn) {
          return this.getPrice(item['currency_code'], priceIn);
        } else {
          return of(item);
        }
      }),
      reduce(
        (current, x) => {
          current.amount += x.amount;
          return current;
        },
        {
          currency_code: priceIn,
          amount: 0,
        },
      ),
    );

    return forkJoin({
      balances,
      total,
    });
  }

  async buy(
    asset: string,
    using: string,
    amount?: number,
    stopLoss?: number,
  ): Promise<any> {
    /* get balance, compute total asset, allocate */
    /* if amount is not specified, getBalance and check rebalancing configuration */
    if (amount === undefined) {
      try {
        const myAsset = await this.getBalance(using)
          .pipe(
            map((x) => x.total),
            filter((x) => x.currency_code === using),
          )
          .toPromise();

        amount = myAsset['amount'];
        const ratio =
          this.configs.rebalanceProfiles
            ?.filter((x) => x.asset === asset)
            .map((x) => x.ratio as number)[0] ?? 1;

        amount *= ratio;
      } catch (error) {
        throw new HttpException(
          'Could not calculate total available asset',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }

    const path = '/v1/me/sendchildorder';
    const requestBody = JSON.stringify({
      product_code: `${asset}_${using}`,
      child_order_type: 'MARKET',
      side: 'BUY',
      size: amount,
      time_in_force: 'GTC',
    });
    const signature = this.createSignature('POST', path, requestBody);
    const response = this.httpService
      .post(this.baseURL + path, requestBody, {
        headers: signature,
      })
      .toPromise();

    return response;
  }

  async sell(asset: string, sellFor: string, amount?: number): Promise<any> {
    // if amount is not specified, getBalance and sell all
    if (amount === undefined) {
      try {
        const myAsset = await this.getBalance(sellFor)
          .pipe(
            mergeMap((x) => x.balances),
            filter((x) => x['currency_code'] === asset),
          )
          .toPromise();

        amount = myAsset['amount'];
      } catch (error) {
        throw new HttpException(
          'Could not find an asset to sell.',
          HttpStatus.EXPECTATION_FAILED,
        );
      }
    }

    const path = '/v1/me/sendchildorder';
    const requestBody = JSON.stringify({
      product_code: `${asset}_${sellFor}`,
      child_order_type: 'MARKET',
      side: 'SELL',
      size: amount,
      time_in_force: 'GTC',
    });
    const signature = this.createSignature('POST', path, requestBody);
    const response = this.httpService
      .post(this.baseURL + path, requestBody, {
        headers: signature,
      })
      .toPromise();

    return response;
  }

  clear(asset: string, denominator: string): Promise<any> {
    const path = '/v1/me/cancelallchildorders';
    const requestBody = JSON.stringify({
      product_code: `${asset}_${denominator}`,
    });
    const signature = this.createSignature('POST', path, requestBody);
    const response = this.httpService
      .post(this.baseURL + path, requestBody, {
        headers: signature,
      })
      .toPromise();

    return response;
  }
}
