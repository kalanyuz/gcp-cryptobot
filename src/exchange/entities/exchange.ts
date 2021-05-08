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
}
