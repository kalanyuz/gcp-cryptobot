# GCP-Cryptobot Development Guide

## Project Overview

Serverless cryptocurrency trading automation platform for Google Cloud Run. Executes trades on Binance and BitFlyer based on TradingView webhook signals.

## Tech Stack

- **Language:** TypeScript 4.3
- **Framework:** NestJS 7.6
- **Runtime:** Node.js 14.x
- **Cloud:** GCP (Cloud Run, Secret Manager)
- **Testing:** Jest with Supertest
- **Container:** Docker with multi-stage builds

## Quick Commands

```bash
yarn install          # Install dependencies
yarn build            # Build production bundle
yarn start:dev        # Development with hot reload (debug on 0.0.0.0:9229)
yarn start            # Run production build
yarn test             # Run unit tests
yarn test:e2e         # Run E2E tests
yarn lint             # ESLint with auto-fix
yarn format           # Prettier formatting
```

## Architecture

```
Webhook → TradingViewGuard (IP whitelist) → ExchangeInterceptor (pair validation)
       → ExchangeController → ExchangeService (abstract) → Exchange API
```

### Key Directories

- `src/exchange/` - Controllers, services, and entities for trading
- `src/exchange/services/` - Exchange implementations (Binance, BitFlyer)
- `src/services/configs/` - YAML configuration and loading
- `src/services/secrets/` - GCP Secret Manager integration
- `src/guard/` - Security guards and interceptors

### Exchange Adapter Pattern

Exchange implementations extend `ExchangeService` abstract class:

```typescript
abstract class ExchangeService {
  abstract getPrice(ofProduct: string, priceIn: string): Observable<any>;
  abstract getBalance(priceIn: string): any;
  abstract buy(asset: string, using: string, mode?: OrderType, amount?: number, price?: number): any;
  abstract sell(asset: string, sellFor: string, amount?: number): any;
  abstract bidDips?(asset: string, using: string, dipConfig: Dip[]): any;
  abstract clear(asset: string, denominator: string): any;
}
```

## Configuration

YAML config in `src/services/configs/`:

```yaml
configurations:
  secret_keyname: 'BINANCE_SECRET'    # GCP Secret Manager key
  api_keyname: 'BINANCE_APIKEY'
  trade_with: 'USDT'                  # Base currency
  rebalance:
    - 'BTC:40'                        # Asset:percentage
    - 'ETH:35'
  trading_pairs:
    - 'BTC:USDT'                      # Allowed pairs (security whitelist)
    - 'ETH:BTC'
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `EXCHANGE` | Exchange module: `binance` or `bitflyer` |
| `GUARD` | Auth guard: `tradingview` or `none` |
| `PORT` | Server port |
| `CONFIGFILE` | Path to YAML config |
| `GOOGLE_APPLICATION_CREDENTIALS` | GCP service account JSON path |

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/exchange/health` | GET | Health check |
| `/exchange/buy` | POST | Market buy (optional amount) |
| `/exchange/sell` | POST | Market sell (optional amount) |
| `/exchange/buywithfiat` | POST | Buy with fiat budget |
| `/exchange/buythedip` | POST | Place limit orders at dip percentages |
| `/exchange/clear` | POST | Cancel all orders for pair |

### Request Body (BotRequest)

```typescript
{
  asset: string;        // e.g., "ETH"
  denominator: string;  // e.g., "BTC"
  amount?: number;      // Optional fixed amount
  price?: number;       // For limit orders
  dip?: Dip[];         // For buythedip [{percent: 5, allocation: 50}]
}
```

## Code Conventions

- **RxJS Observables** for async exchange API calls
- **HMAC-SHA256** signing for exchange authentication
- **NestJS dependency injection** throughout
- **Abstract service pattern** for exchange implementations
- Single quotes, trailing commas (Prettier configured)
- Test files: `*.spec.ts` (unit), `*.e2e-spec.ts` (E2E)

## Testing Patterns

```typescript
// Mock HTTP responses
jest.spyOn(httpService, 'get').mockImplementation(() => of({ data: mockData }));

// Mock secrets service
const mockSecretsService = { getSecret: jest.fn().mockResolvedValue('api-key') };

// RxJS observable testing
service.getPrice('BTC', 'USDT').subscribe({
  next: (result) => { expect(result).toBe(expected); done(); },
  error: done.fail
});
```

## Security Features

1. **TradingViewGuard** - IP whitelist (52.89.214.238, 34.212.75.30, 54.218.53.128, 52.32.178.7)
2. **ExchangeInterceptor** - Trading pair validation against config whitelist
3. **GCP Secret Manager** - API keys never in code/env vars
4. **Parameter validation** - Type assertions in controller

## Adding a New Exchange

1. Create `src/exchange/services/{exchange}.service.ts` extending `ExchangeService`
2. Implement all abstract methods with exchange-specific API calls
3. Create `src/{exchange}.module.ts` with HttpModule and service providers
4. Add exchange selection in `src/main.ts` bootstrap
5. Create sample config `src/services/configs/config.{exchange}.sample.yaml`
6. Add tests in `src/exchange/services/{exchange}.service.spec.ts`

## Common Gotchas

- **Lot size precision:** Binance requires LOT_SIZE filter compliance; BitFlyer uses 8 decimals
- **Rebalance calculation:** Uses 95% of available funds to avoid rounding issues
- **Pair format:** Binance concatenates (BTCUSDT), BitFlyer uses underscore (BTC_JPY)
- **BitFlyer restriction:** Only supports JPY-denominated pairs
