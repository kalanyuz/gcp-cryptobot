"""Exchange connectivity using ccxt."""

import ccxt
import polars as pl
from datetime import datetime, timezone


class ExchangeClient:
    """Client for exchange operations (Binance by default)."""

    def __init__(
        self,
        exchange_id: str = "binance",
        api_key: str | None = None,
        api_secret: str | None = None,
        testnet: bool = False,
    ):
        exchange_class = getattr(ccxt, exchange_id)

        config = {
            "apiKey": api_key,
            "secret": api_secret,
            "enableRateLimit": True,
        }

        if testnet and exchange_id == "binance":
            config["options"] = {"defaultType": "future"}
            config["sandbox"] = True

        self.exchange: ccxt.Exchange = exchange_class(config)
        self.exchange_id = exchange_id

    def fetch_candles(
        self,
        symbol: str,
        timeframe: str = "1d",
        limit: int = 100,
    ) -> pl.DataFrame:
        """Fetch OHLCV candles from exchange.

        Args:
            symbol: Trading pair (e.g., 'BTC/USDT')
            timeframe: Candle timeframe ('1m', '5m', '1h', '4h', '1d', etc.)
            limit: Number of candles to fetch

        Returns:
            DataFrame with columns: timestamp, open, high, low, close, volume
        """
        ohlcv = self.exchange.fetch_ohlcv(symbol, timeframe, limit=limit)

        candles = []
        for row in ohlcv:
            candles.append({
                "timestamp": row[0],
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5]),
            })

        return pl.DataFrame(candles)

    def get_balance(self, asset: str) -> dict:
        """Get balance for a specific asset.

        Returns:
            Dict with 'free', 'used', 'total' amounts
        """
        balance = self.exchange.fetch_balance()
        return balance.get(asset, {"free": 0, "used": 0, "total": 0})

    def get_position(self, symbol: str) -> dict | None:
        """Get current position for a symbol.

        Returns:
            Position info or None if no position
        """
        try:
            positions = self.exchange.fetch_positions([symbol])
            for pos in positions:
                if pos["symbol"] == symbol and float(pos["contracts"] or 0) > 0:
                    return pos
        except Exception:
            pass
        return None

    def market_buy(
        self,
        symbol: str,
        amount: float | None = None,
        quote_amount: float | None = None,
    ) -> dict:
        """Execute market buy order.

        Args:
            symbol: Trading pair (e.g., 'BTC/USDT')
            amount: Amount in base currency (e.g., 0.01 BTC)
            quote_amount: Amount in quote currency (e.g., 100 USDT)

        Returns:
            Order result
        """
        if quote_amount and not amount:
            ticker = self.exchange.fetch_ticker(symbol)
            price = ticker["last"]
            amount = quote_amount / price

        return self.exchange.create_market_buy_order(symbol, amount)

    def market_sell(self, symbol: str, amount: float) -> dict:
        """Execute market sell order.

        Args:
            symbol: Trading pair (e.g., 'BTC/USDT')
            amount: Amount in base currency to sell

        Returns:
            Order result
        """
        return self.exchange.create_market_sell_order(symbol, amount)

    def get_min_order_amount(self, symbol: str) -> float:
        """Get minimum order amount for a symbol."""
        self.exchange.load_markets()
        market = self.exchange.market(symbol)
        return market.get("limits", {}).get("amount", {}).get("min", 0.0)
