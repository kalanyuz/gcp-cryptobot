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
import { from, Observable, of, throwError } from 'rxjs';
import { ExchangeService } from '../exchange.service';
import * as crypto from 'crypto';
import { forkJoin } from 'rxjs';
import { SecretsService } from '../../services/secrets/secrets.service';
import { Asset, Balance, OrderType } from '../entities/exchange';

/**
 * Notes about using binance testnet.
 * Binance testnet does not contain the same asset pairs.
 * as listed in the production version.
 * Please test that the asset pairs you'd like to trade exists.
 * Otherwise, autorebalance on buy will not work.
 */
@Injectable()
export class BinanceExchange extends ExchangeService {
  baseURL: string = 'https://api.binance.com';
  key = {
    'Content-Type': 'application/json',
    'X-MBX-APIKEY': '',
  };
  secret: string = '';

  constructor(
    httpService: HttpService,
    private configs: BotConfigService,
    secretService: SecretsService,
  ) {
    super(httpService, secretService);
  }

  private async initSecrets(): Promise<void> {
    const apiKeyName: string = this.configs.settings['api_keyname'];
    const secretKeyName: string = this.configs.settings['secret_keyname'];

    if (this.secret === '' || this.key['X-MBX-APIKEY'] === '') {
      this.key['X-MBX-APIKEY'] = await this.secretService.getSecret(apiKeyName);
      this.secret = await this.secretService.getSecret(secretKeyName);
    }
  }

  private async createSignature(query: string): Promise<string> {
    await this.initSecrets();
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(query)
      .digest('hex');

    return signature;
  }

  getLotSize(ofProduct: string, priceIn: string): Observable<any> {
    const path = '/api/v3/exchangeInfo?';
    const response = this.httpService.get(
      `${this.baseURL}${path}symbol=${ofProduct}${priceIn}`,
    );
    const price = response.pipe(
      map((x) => x.data),
      map((x) => {
        if (x['symbols'][0].symbol !== `${ofProduct}${priceIn}`) {
          console.error(
            'Price info returned different from what is requested.',
          );
          throw new HttpException(
            'Failed to get price info',
            HttpStatus.EXPECTATION_FAILED,
          );
        }
        try {
          const lotInfo = x['symbols'][0].filters
            .filter((item) => item.filterType === 'LOT_SIZE')
            .pop();
          const minQuantity = parseFloat(lotInfo['minQty']);
          const stepSize = parseFloat(lotInfo['stepSize']);
          if (isNaN(minQuantity)) throw 'NaN';

          return {
            min_quantity: minQuantity,
            step_size: stepSize,
            currency_code: `${ofProduct}${priceIn}`,
          };
        } catch (err) {
          console.error(err);
          throw new HttpException(
            'Failed to get price info',
            HttpStatus.BAD_REQUEST,
          );
        }
      }),
      catchError((err) => {
        return throwError(err);
      }),
    );
    return price;
  }

  getTime(): Promise<number> {
    const path = '/api/v3/time';
    const response = this.httpService.get(`${this.baseURL}${path}`);
    const time = response.pipe(
      map((x) => x.data.serverTime),
      catchError((err) => {
        console.error('failed to get server time.');
        return throwError(err);
      }),
    );
    return time.toPromise();
  }

  getPrice(ofProduct: string, priceIn: string): Observable<Asset> {
    const path = '/api/v3/ticker/price?';
    const response = this.httpService.get(
      `${this.baseURL}${path}symbol=${ofProduct}${priceIn}`,
    );
    const price = response.pipe(
      map((x) => x.data),
      map((x) => {
        if (x['symbol'] !== `${ofProduct}${priceIn}`) {
          console.error(
            'Price info returned different from what is requested.',
          );
          throw new HttpException(
            'Failed to get price info',
            HttpStatus.EXPECTATION_FAILED,
          );
        }
        try {
          const price = parseFloat(x['price']);
          if (isNaN(price)) throw 'NaN';

          return {
            amount: price,
            currency_code: `${ofProduct}${priceIn}`,
          };
        } catch (err) {
          console.error(err);
          throw new HttpException(
            'Failed to get price info',
            HttpStatus.BAD_REQUEST,
          );
        }
      }),
      catchError((err) => {
        return throwError(err);
      }),
    );
    return price;
  }

  async getBalance(priceIn: string): Promise<Balance> {
    const path = '/api/v3/account?';
    const query = `timestamp=${await this.getTime()}`;
    const signature = await this.createSignature(query);
    const response = this.httpService.get(
      `${this.baseURL}${path}${query}&signature=${signature}`,
      {
        headers: this.key,
      },
    );

    const balances = response.pipe(
      mergeMap((x) => x.data.balances),
      map((x) => ({
        currency_code: x['asset'],
        amount: parseFloat(x['free']) + parseFloat(x['locked']),
        available: parseFloat(x['free']),
      })),
      filter((x) => x['amount'] > 0),
      toArray<Asset>(),
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
    }).toPromise();
  }

  async buy(
    asset: string,
    using: string,
    mode: OrderType = OrderType.Market,
    amount?: number,
    price?: number,
  ): Promise<any> {
    /* get balance, compute total asset, allocate */
    /* if amount is not specified, getBalance and check rebalancing configuration */
    if (amount === undefined) {
      try {
        const myAsset = await of(await this.getBalance(using))
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
        const assetPrice = await this.getPrice(asset, using).toPromise();
        const lotInfo = await this.getLotSize(asset, using).toPromise();
        const purchaseAmount = amount / assetPrice.amount;
        const remainder = (amount / assetPrice.amount) % lotInfo.min_quantity;
        amount = purchaseAmount - remainder;
      } catch (error) {
        const errorMessage = 'Could not calculate total available asset.';
        console.error(errorMessage);
        throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }

    const path = '/api/v3/order?';
    const timestamp = await this.getTime();
    let query = `symbol=${asset}${using}&side=BUY&type=${mode}&quantity=${amount.toFixed(
      8,
    )}&newOrderRespType=FULL&timestamp=${timestamp}`;
    if (mode === OrderType.Limit) {
      query = `${query}&price=${price}&timeInForce=GTC`;
    }
    console.log(query);
    const signature = await this.createSignature(query);
    const response = this.httpService
      .post(`${this.baseURL}${path}${query}&signature=${signature}`, null, {
        headers: this.key,
      })
      .pipe(
        map((item) => item.data),
        catchError((err) => {
          console.error(err.response.data);
          return throwError(err);
        }),
      )
      .toPromise();

    return response;
  }

  async sell(asset: string, sellFor: string, amount?: number): Promise<any> {
    if (amount === undefined) {
      try {
        const myAsset = await of(await this.getBalance(sellFor))
          .pipe(
            mergeMap((x) => x.balances),
            filter((x) => x['currency_code'] === asset),
          )
          .toPromise();

        amount = myAsset['amount'];
        const lotInfo = await this.getLotSize(asset, sellFor).toPromise();
        console.log(lotInfo);
        const remainder = amount % lotInfo.min_quantity;
        amount = amount - remainder;
      } catch (error) {
        const errorMessage = 'Could not find an asset to sell.';
        console.error(errorMessage);
        throw new HttpException(
          'Could not find an asset to sell.',
          HttpStatus.EXPECTATION_FAILED,
        );
      }
    }

    const path = '/api/v3/order?';
    const timestamp = await this.getTime();
    const query = `symbol=${asset}${sellFor}&side=SELL&type=MARKET&quantity=${amount.toFixed(
      8,
    )}&newOrderRespType=FULL&timestamp=${timestamp}`;
    console.log(query);
    const signature = await this.createSignature(query);
    const response = this.httpService
      .post(`${this.baseURL}${path}${query}&signature=${signature}`, null, {
        headers: this.key,
      })
      .pipe(
        map((item) => item.data),
        catchError((err) => {
          console.error(err.response.data);
          return throwError(err);
        }),
      )
      .toPromise();

    return response;
  }

  // TODO: implement
  clear: undefined;

  // TODO: implement
  bidDips: undefined;
}
