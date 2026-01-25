# Cryptobot Python

Self-contained cryptocurrency trading bot with backtesting and live trading.

## Requirements

- Python 3.13+
- [uv](https://github.com/astral-sh/uv) package manager

## Installation

```bash
cd python
uv sync
```

## Strategies

| Strategy | Description |
|----------|-------------|
| `sma-crossover` | Fast 10/20 SMA crossover - best for clean trends |
| `cdc-actionzone` | CDC ActionZone V3 - filtered signals with zone confirmation |
| `cdc-confirmed-sma` | Hybrid - SMA timing + CDC zone filter (recommended) |

## Backtesting

Run backtest comparison on BTC and DOGE:

```bash
uv run python run_backtest.py
```

## Live Trading

### Configuration

Create `.env` file (see `.env.example`):

```bash
BINANCE_API_KEY=your_api_key
BINANCE_API_SECRET=your_api_secret
```

### Commands

```bash
# Dry run - no actual trades (for testing)
uv run python run_live.py --dry-run --once

# Live trading loop on testnet
uv run python run_live.py --testnet

# Live trading on mainnet (careful!)
uv run python run_live.py --mainnet

# Custom configuration
uv run python run_live.py \
  --symbol ETH/USDT \
  --timeframe 4h \
  --strategy cdc-confirmed-sma \
  --mainnet
```

### Options

| Flag | Description |
|------|-------------|
| `--symbol` | Trading pair (default: BTC/USDT) |
| `--timeframe` | Candle interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d (default: 1d) |
| `--strategy` | Strategy name (default: cdc-confirmed-sma) |
| `--testnet` | Use Binance testnet (default) |
| `--mainnet` | Use Binance mainnet |
| `--dry-run` | Simulate trades without executing |
| `--once` | Run once and exit (no loop) |

### How It Works

1. Waits for candle close (based on timeframe)
2. Fetches latest candles from Binance
3. Runs strategy on confirmed candle (not the forming one)
4. Executes trade if signal fires (BUY/SELL)
5. Persists position state to `trader_state.json`
6. Repeats at next candle close

No TradingView dependency - fully self-contained.
