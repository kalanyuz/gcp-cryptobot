"""SQLite database for trading state and decision logs.

Tables:
- positions: Current open positions
- trades: Executed trade history
- decisions: Claude's decision log with reasoning
- market_snapshots: Market state at decision time
- portfolio: Balance and P&L tracking
"""

import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path
from dataclasses import dataclass
from typing import Literal


@dataclass
class Position:
    id: int | None
    symbol: str
    side: Literal["long", "short"]
    entry_price: float
    quantity: float
    entry_time: str
    stop_loss: float | None = None
    take_profit: float | None = None
    status: str = "open"


@dataclass
class Decision:
    id: int | None
    timestamp: str
    symbol: str
    action: Literal["BUY", "SELL", "HOLD"]
    reasoning: str
    confidence: float
    market_context: dict
    executed: bool = False
    execution_price: float | None = None


class TradingDatabase:
    """SQLite database for trading operations."""

    def __init__(self, db_path: str = "trading.db"):
        self.db_path = Path(db_path)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self):
        """Initialize database schema."""
        cursor = self.conn.cursor()

        # Positions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS positions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                entry_price REAL NOT NULL,
                quantity REAL NOT NULL,
                entry_time TEXT NOT NULL,
                stop_loss REAL,
                take_profit REAL,
                status TEXT DEFAULT 'open',
                exit_price REAL,
                exit_time TEXT,
                pnl_percent REAL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Trades table (executed orders)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                position_id INTEGER,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                action TEXT NOT NULL,
                price REAL NOT NULL,
                quantity REAL NOT NULL,
                commission REAL DEFAULT 0,
                timestamp TEXT NOT NULL,
                order_id TEXT,
                FOREIGN KEY (position_id) REFERENCES positions(id)
            )
        """)

        # Decision log (Claude's reasoning)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS decisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                symbol TEXT NOT NULL,
                action TEXT NOT NULL,
                reasoning TEXT NOT NULL,
                confidence REAL,
                market_context TEXT,
                executed INTEGER DEFAULT 0,
                execution_price REAL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Market snapshots at decision time
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS market_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                decision_id INTEGER,
                symbol TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                price REAL NOT NULL,
                sma_10 REAL,
                sma_20 REAL,
                ema_12 REAL,
                ema_26 REAL,
                rsi_14 REAL,
                bb_upper REAL,
                bb_middle REAL,
                bb_lower REAL,
                bb_percent_b REAL,
                atr_14 REAL,
                wave_position TEXT,
                wave_confidence REAL,
                confluence_level TEXT,
                confluence_score REAL,
                raw_data TEXT,
                FOREIGN KEY (decision_id) REFERENCES decisions(id)
            )
        """)

        # Portfolio tracking
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS portfolio (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                total_balance REAL NOT NULL,
                available_balance REAL NOT NULL,
                unrealized_pnl REAL DEFAULT 0,
                realized_pnl REAL DEFAULT 0,
                total_trades INTEGER DEFAULT 0,
                winning_trades INTEGER DEFAULT 0,
                max_drawdown REAL DEFAULT 0
            )
        """)

        # Config/settings
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        self.conn.commit()

    # Position operations
    def open_position(self, position: Position) -> int:
        """Open a new position."""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO positions (symbol, side, entry_price, quantity, entry_time, stop_loss, take_profit, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
        """, (position.symbol, position.side, position.entry_price, position.quantity,
              position.entry_time, position.stop_loss, position.take_profit))
        self.conn.commit()
        return cursor.lastrowid

    def close_position(self, position_id: int, exit_price: float, exit_time: str) -> float:
        """Close a position and calculate PnL."""
        cursor = self.conn.cursor()

        # Get position details
        cursor.execute("SELECT * FROM positions WHERE id = ?", (position_id,))
        row = cursor.fetchone()
        if not row:
            return 0.0

        # Calculate PnL
        if row["side"] == "long":
            pnl_percent = (exit_price - row["entry_price"]) / row["entry_price"] * 100
        else:
            pnl_percent = (row["entry_price"] - exit_price) / row["entry_price"] * 100

        # Update position
        cursor.execute("""
            UPDATE positions
            SET status = 'closed', exit_price = ?, exit_time = ?, pnl_percent = ?
            WHERE id = ?
        """, (exit_price, exit_time, pnl_percent, position_id))
        self.conn.commit()

        return pnl_percent

    def get_open_positions(self, symbol: str | None = None) -> list[Position]:
        """Get all open positions, optionally filtered by symbol."""
        cursor = self.conn.cursor()
        if symbol:
            cursor.execute("SELECT * FROM positions WHERE status = 'open' AND symbol = ?", (symbol,))
        else:
            cursor.execute("SELECT * FROM positions WHERE status = 'open'")

        positions = []
        for row in cursor.fetchall():
            positions.append(Position(
                id=row["id"],
                symbol=row["symbol"],
                side=row["side"],
                entry_price=row["entry_price"],
                quantity=row["quantity"],
                entry_time=row["entry_time"],
                stop_loss=row["stop_loss"],
                take_profit=row["take_profit"],
                status=row["status"],
            ))
        return positions

    def get_position_by_symbol(self, symbol: str) -> Position | None:
        """Get open position for a symbol (assumes one position per symbol)."""
        positions = self.get_open_positions(symbol)
        return positions[0] if positions else None

    # Decision logging
    def log_decision(self, decision: Decision, market_snapshot: dict | None = None) -> int:
        """Log a trading decision with reasoning."""
        cursor = self.conn.cursor()

        cursor.execute("""
            INSERT INTO decisions (timestamp, symbol, action, reasoning, confidence, market_context, executed, execution_price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (decision.timestamp, decision.symbol, decision.action, decision.reasoning,
              decision.confidence, json.dumps(decision.market_context), decision.executed, decision.execution_price))

        decision_id = cursor.lastrowid

        # Log market snapshot if provided
        if market_snapshot:
            cursor.execute("""
                INSERT INTO market_snapshots (
                    decision_id, symbol, timestamp, price,
                    sma_10, sma_20, ema_12, ema_26, rsi_14,
                    bb_upper, bb_middle, bb_lower, bb_percent_b, atr_14,
                    wave_position, wave_confidence, confluence_level, confluence_score,
                    raw_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                decision_id, market_snapshot.get("symbol"), market_snapshot.get("timestamp"),
                market_snapshot.get("price"),
                market_snapshot.get("sma_10"), market_snapshot.get("sma_20"),
                market_snapshot.get("ema_12"), market_snapshot.get("ema_26"),
                market_snapshot.get("rsi_14"),
                market_snapshot.get("bb_upper"), market_snapshot.get("bb_middle"),
                market_snapshot.get("bb_lower"), market_snapshot.get("bb_percent_b"),
                market_snapshot.get("atr_14"),
                market_snapshot.get("wave_position"), market_snapshot.get("wave_confidence"),
                market_snapshot.get("confluence_level"), market_snapshot.get("confluence_score"),
                json.dumps(market_snapshot.get("raw_data", {})),
            ))

        self.conn.commit()
        return decision_id

    def get_recent_decisions(self, symbol: str | None = None, limit: int = 10) -> list[dict]:
        """Get recent decisions."""
        cursor = self.conn.cursor()
        if symbol:
            cursor.execute("""
                SELECT * FROM decisions WHERE symbol = ? ORDER BY timestamp DESC LIMIT ?
            """, (symbol, limit))
        else:
            cursor.execute("SELECT * FROM decisions ORDER BY timestamp DESC LIMIT ?", (limit,))

        return [dict(row) for row in cursor.fetchall()]

    # Trade logging
    def log_trade(self, position_id: int, symbol: str, side: str, action: str,
                  price: float, quantity: float, timestamp: str, order_id: str | None = None,
                  commission: float = 0) -> int:
        """Log an executed trade."""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO trades (position_id, symbol, side, action, price, quantity, commission, timestamp, order_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (position_id, symbol, side, action, price, quantity, commission, timestamp, order_id))
        self.conn.commit()
        return cursor.lastrowid

    # Portfolio tracking
    def update_portfolio(self, total_balance: float, available_balance: float,
                         unrealized_pnl: float = 0, realized_pnl: float = 0):
        """Update portfolio snapshot."""
        cursor = self.conn.cursor()

        # Get trade stats
        cursor.execute("SELECT COUNT(*) as total, SUM(CASE WHEN pnl_percent > 0 THEN 1 ELSE 0 END) as wins FROM positions WHERE status = 'closed'")
        stats = cursor.fetchone()

        # Calculate max drawdown from history
        cursor.execute("SELECT MIN(total_balance) as min_bal, MAX(total_balance) as max_bal FROM portfolio")
        bal = cursor.fetchone()
        max_drawdown = 0
        if bal["max_bal"] and bal["min_bal"]:
            max_drawdown = (bal["max_bal"] - bal["min_bal"]) / bal["max_bal"] * 100

        cursor.execute("""
            INSERT INTO portfolio (timestamp, total_balance, available_balance, unrealized_pnl, realized_pnl, total_trades, winning_trades, max_drawdown)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (datetime.now(timezone.utc).isoformat(), total_balance, available_balance,
              unrealized_pnl, realized_pnl, stats["total"] or 0, stats["wins"] or 0, max_drawdown))
        self.conn.commit()

    def get_portfolio_summary(self) -> dict:
        """Get latest portfolio summary."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM portfolio ORDER BY timestamp DESC LIMIT 1")
        row = cursor.fetchone()
        if row:
            return dict(row)
        return {
            "total_balance": 0,
            "available_balance": 0,
            "unrealized_pnl": 0,
            "realized_pnl": 0,
            "total_trades": 0,
            "winning_trades": 0,
            "max_drawdown": 0,
        }

    # Config
    def set_config(self, key: str, value: str):
        """Set a config value."""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO config (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        """, (key, value))
        self.conn.commit()

    def get_config(self, key: str, default: str | None = None) -> str | None:
        """Get a config value."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT value FROM config WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row["value"] if row else default

    # Analytics
    def get_performance_stats(self) -> dict:
        """Get overall performance statistics."""
        cursor = self.conn.cursor()

        # Trade stats
        cursor.execute("""
            SELECT
                COUNT(*) as total_trades,
                SUM(CASE WHEN pnl_percent > 0 THEN 1 ELSE 0 END) as winning_trades,
                AVG(pnl_percent) as avg_pnl,
                MAX(pnl_percent) as best_trade,
                MIN(pnl_percent) as worst_trade,
                SUM(pnl_percent) as total_pnl
            FROM positions WHERE status = 'closed'
        """)
        trade_stats = dict(cursor.fetchone())

        # Calculate win rate
        if trade_stats["total_trades"]:
            trade_stats["win_rate"] = trade_stats["winning_trades"] / trade_stats["total_trades"] * 100
        else:
            trade_stats["win_rate"] = 0

        # Decision stats
        cursor.execute("""
            SELECT
                COUNT(*) as total_decisions,
                SUM(CASE WHEN action = 'BUY' THEN 1 ELSE 0 END) as buy_decisions,
                SUM(CASE WHEN action = 'SELL' THEN 1 ELSE 0 END) as sell_decisions,
                SUM(CASE WHEN action = 'HOLD' THEN 1 ELSE 0 END) as hold_decisions,
                AVG(confidence) as avg_confidence
            FROM decisions
        """)
        decision_stats = dict(cursor.fetchone())

        return {
            "trades": trade_stats,
            "decisions": decision_stats,
        }

    def close(self):
        """Close database connection."""
        self.conn.close()
