/**
 * I'd recommend to manually split the ticker into separate symbols
 * when creating alerts in TradingView
 * For alert placeholder details, refer to: https://www.tradingview.com/chart/?solution=43000531021
 */
export interface BotRequest {
  // Asset of interests (ie. ETH from ticker ETHBTC)
  asset: string;
  // What your asset is priced in (ie. BTC from ticker ETHBTC)
  denominator: string;
  // Amount to sell (optional)
  amount?: number | undefined;
  // Closing price (aka. {{close}} in TradingView)
  price?: number | undefined;
  // Time of alert (aka. {{time}} in TradingView)
  time?: string | undefined;
  // Dip buying configuration in terms of
  // Y % buying power allocate to X % drop in price
  dip?: Dip[] | undefined;
}

export interface Asset {
  amount: number;
  currency_code: string;
  available?: number;
}

export interface Balance {
  balances: Asset[];
  total: Asset;
}

export interface Dip {
  percent: number;
  allocation: number;
}

export enum OrderType {
  Market = 'MARKET',
  Limit = 'LIMIT',
}
