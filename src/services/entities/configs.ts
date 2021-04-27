export interface Configs {
  tradingPairs: TradingPairs[];
}

interface TradingPairs {
  trade: string;
  base: string;
}
