export interface BitFlyerAsset {
  amount: number;
  currency_code: string;
  available?: number;
}

export interface BitFlyerSignature {
  'ACCESS-KEY': string;
  'ACCESS-TIMESTAMP': string;
  'ACCESS-SIGN': string;
  'Content-Type': string;
}

export interface BitFlyerBalance {
  balances: BitFlyerAsset[];
  total: BitFlyerAsset;
}
