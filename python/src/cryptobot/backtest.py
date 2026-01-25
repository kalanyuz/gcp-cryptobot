"""
Backtesting engine.
"""

import math
import polars as pl
from .entities import (
    Signal,
    Trade,
    BacktestConfig,
    BacktestMetrics,
    BacktestResult,
)


class BacktestService:
    """Backtesting engine that simulates trading strategies on historical data."""

    def run_backtest(
        self,
        candles: pl.DataFrame,
        strategy,
        config: BacktestConfig,
    ) -> BacktestResult:
        """
        Run a backtest with the given strategy and candle data.

        Args:
            candles: DataFrame with columns: timestamp, open, high, low, close, volume
            strategy: Strategy instance with calculate() method
            config: Backtest configuration

        Returns:
            BacktestResult with trades, metrics, and equity curve
        """
        if len(candles) < 2:
            raise ValueError("Insufficient candle data for backtesting")

        trades: list[Trade] = []
        equity_data: list[dict] = []
        capital = config.initial_capital
        position: Trade | None = None

        # Get data as lists for faster iteration
        timestamps = candles["timestamp"].to_list()
        closes = candles["close"].to_list()

        # Iterate through candles
        for i in range(1, len(candles)):
            current_close = closes[i]
            current_timestamp = timestamps[i]
            signal = strategy.calculate(candles, i)

            # Handle existing position
            if position:
                if signal == Signal.SELL or i == len(candles) - 1:
                    # Close position
                    exit_price = self._apply_slippage(current_close, config.slippage, "sell")
                    gross_pnl = (exit_price - position.entry_price) * position.size
                    commission = exit_price * position.size * config.commission
                    net_pnl = gross_pnl - commission

                    position.exit_time = current_timestamp
                    position.exit_price = exit_price
                    position.pnl = net_pnl
                    position.pnl_percent = (net_pnl / (position.entry_price * position.size)) * 100

                    capital += position.entry_price * position.size + net_pnl
                    trades.append(position)
                    position = None
            else:
                # No position - check for buy signal
                if signal == Signal.BUY:
                    entry_price = self._apply_slippage(current_close, config.slippage, "buy")
                    position_value = capital * (config.position_size_percent / 100)
                    commission = position_value * config.commission
                    size = (position_value - commission) / entry_price

                    if size > 0 and position_value <= capital:
                        position = Trade(
                            entry_time=current_timestamp,
                            entry_price=entry_price,
                            side="long",
                            size=size,
                        )
                        capital -= position_value

            # Record equity
            current_equity = (
                capital + position.size * current_close
                if position
                else capital
            )
            equity_data.append({
                "timestamp": current_timestamp,
                "equity": current_equity,
            })

        equity_curve = pl.DataFrame(equity_data)
        metrics = self._calculate_metrics(trades, config.initial_capital, equity_curve)

        return BacktestResult(
            config=config,
            trades=trades,
            metrics=metrics,
            equity_curve=equity_curve,
        )

    def _apply_slippage(self, price: float, slippage: float, side: str) -> float:
        """Apply slippage to price."""
        slippage_amount = price * slippage
        return price + slippage_amount if side == "buy" else price - slippage_amount

    def _calculate_metrics(
        self,
        trades: list[Trade],
        initial_capital: float,
        equity_curve: pl.DataFrame,
    ) -> BacktestMetrics:
        """Calculate performance metrics from trades."""
        if not trades:
            return BacktestMetrics()

        completed_trades = [t for t in trades if t.pnl is not None]
        winning_trades = [t for t in completed_trades if t.pnl > 0]
        losing_trades = [t for t in completed_trades if t.pnl <= 0]

        total_pnl = sum(t.pnl for t in completed_trades)
        gross_profit = sum(t.pnl for t in winning_trades)
        gross_loss = abs(sum(t.pnl for t in losing_trades))

        avg_win = gross_profit / len(winning_trades) if winning_trades else 0
        avg_loss = gross_loss / len(losing_trades) if losing_trades else 0

        max_dd, max_dd_percent = self._calculate_drawdown(equity_curve)
        returns = self._calculate_returns(equity_curve)
        sharpe = self._calculate_sharpe_ratio(returns)
        sortino = self._calculate_sortino_ratio(returns)

        avg_holding_period = (
            sum(t.exit_time - t.entry_time for t in completed_trades) / len(completed_trades)
            if completed_trades
            else 0
        )

        return BacktestMetrics(
            total_trades=len(completed_trades),
            winning_trades=len(winning_trades),
            losing_trades=len(losing_trades),
            win_rate=(len(winning_trades) / len(completed_trades) * 100) if completed_trades else 0,
            total_pnl=total_pnl,
            total_pnl_percent=(total_pnl / initial_capital) * 100,
            average_win=avg_win,
            average_loss=avg_loss,
            largest_win=max((t.pnl for t in winning_trades), default=0),
            largest_loss=min((t.pnl for t in losing_trades), default=0),
            profit_factor=(gross_profit / gross_loss) if gross_loss > 0 else (float("inf") if gross_profit > 0 else 0),
            max_drawdown=max_dd,
            max_drawdown_percent=max_dd_percent,
            sharpe_ratio=sharpe,
            sortino_ratio=sortino,
            avg_holding_period_ms=avg_holding_period,
        )

    def _calculate_drawdown(self, equity_curve: pl.DataFrame) -> tuple[float, float]:
        """Calculate maximum drawdown from equity curve."""
        if len(equity_curve) == 0:
            return 0.0, 0.0

        equities = equity_curve["equity"].to_list()
        peak = equities[0]
        max_drawdown = 0.0
        max_drawdown_percent = 0.0

        for equity in equities:
            if equity > peak:
                peak = equity
            drawdown = peak - equity
            drawdown_percent = (drawdown / peak) * 100 if peak > 0 else 0

            if drawdown > max_drawdown:
                max_drawdown = drawdown
                max_drawdown_percent = drawdown_percent

        return max_drawdown, max_drawdown_percent

    def _calculate_returns(self, equity_curve: pl.DataFrame) -> list[float]:
        """Calculate period returns from equity curve."""
        if len(equity_curve) < 2:
            return []

        equities = equity_curve["equity"].to_list()
        returns = []
        for i in range(1, len(equities)):
            if equities[i - 1] != 0:
                ret = (equities[i] - equities[i - 1]) / equities[i - 1]
                returns.append(ret)
        return returns

    def _calculate_sharpe_ratio(self, returns: list[float]) -> float:
        """Calculate Sharpe Ratio (assuming risk-free rate of 0)."""
        if not returns:
            return 0.0

        mean = sum(returns) / len(returns)
        variance = sum((r - mean) ** 2 for r in returns) / len(returns)
        std_dev = math.sqrt(variance)

        if std_dev == 0:
            return 0.0

        # Annualize (assuming daily returns, 252 trading days)
        return (mean / std_dev) * math.sqrt(252)

    def _calculate_sortino_ratio(self, returns: list[float]) -> float:
        """Calculate Sortino Ratio (only considers downside volatility)."""
        if not returns:
            return 0.0

        mean = sum(returns) / len(returns)
        negative_returns = [r for r in returns if r < 0]

        if not negative_returns:
            return float("inf") if mean > 0 else 0.0

        downside_variance = sum(r ** 2 for r in negative_returns) / len(negative_returns)
        downside_std_dev = math.sqrt(downside_variance)

        if downside_std_dev == 0:
            return 0.0

        # Annualize
        return (mean / downside_std_dev) * math.sqrt(252)

    def format_results(self, result: BacktestResult) -> str:
        """Format backtest results as a summary string."""
        m = result.metrics
        duration_days = (
            (result.equity_curve["timestamp"][-1] - result.equity_curve["timestamp"][0])
            / (24 * 60 * 60 * 1000)
            if len(result.equity_curve) > 0
            else 0
        )

        pf_str = "∞" if m.profit_factor == float("inf") else f"{m.profit_factor:.2f}"
        sortino_str = "∞" if m.sortino_ratio == float("inf") else f"{m.sortino_ratio:.2f}"

        return f"""
╔══════════════════════════════════════════════════════════╗
║                    BACKTEST RESULTS                       ║
╠══════════════════════════════════════════════════════════╣
║ Symbol: {result.config.symbol:<20} Timeframe: {result.config.timeframe:<10} ║
║ Period: {duration_days:.0f} days                                         ║
╠══════════════════════════════════════════════════════════╣
║ PERFORMANCE                                               ║
╠══════════════════════════════════════════════════════════╣
║ Initial Capital:    ${result.config.initial_capital:>15,.2f}              ║
║ Final Capital:      ${result.config.initial_capital + m.total_pnl:>15,.2f}              ║
║ Total P&L:          ${m.total_pnl:>15,.2f} ({m.total_pnl_percent:.2f}%)      ║
╠══════════════════════════════════════════════════════════╣
║ TRADES                                                    ║
╠══════════════════════════════════════════════════════════╣
║ Total Trades:       {m.total_trades:>10}                          ║
║ Winning Trades:     {m.winning_trades:>10}                          ║
║ Losing Trades:      {m.losing_trades:>10}                          ║
║ Win Rate:           {m.win_rate:>10.2f}%                         ║
╠══════════════════════════════════════════════════════════╣
║ RISK METRICS                                              ║
╠══════════════════════════════════════════════════════════╣
║ Max Drawdown:       ${m.max_drawdown:>15,.2f} ({m.max_drawdown_percent:.2f}%)    ║
║ Profit Factor:      {pf_str:>10}                          ║
║ Sharpe Ratio:       {m.sharpe_ratio:>10.2f}                          ║
║ Sortino Ratio:      {sortino_str:>10}                          ║
╚══════════════════════════════════════════════════════════╝
        """.strip()
