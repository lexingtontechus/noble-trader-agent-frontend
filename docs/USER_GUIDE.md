# Noble Trader — User Guide

> **Version 7.0.0** | Institutional-grade paper trading platform with HMM regime detection, risk management, and real-time market data.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Navigation](#navigation)
3. [Dashboard](#dashboard)
4. [Price Feed & Market Data](#price-feed--market-data)
5. [Order Management](#order-management)
6. [Portfolio](#portfolio)
7. [Trading Workflow](#trading-workflow)
8. [Simulation & Monte Carlo](#simulation--monte-carlo)
9. [Operational Controls](#operational-controls)
10. [Settings](#settings)
11. [Keyboard Shortcuts](#keyboard-shortcuts)
12. [Glossary](#glossary)

---

## Getting Started

### Creating an Account

1. Click **Sign In** in the top navigation bar
2. Create an account using email or Google OAuth via Clerk
3. Once signed in, you'll see the full platform navigation

### Connecting Your Trading Account

Before you can place orders, you need to connect your Alpaca paper trading API keys:

1. Navigate to **Settings** (click your avatar → Settings)
2. Under **API Keys**, enter your Alpaca Paper Trading API Key and Secret Key
3. Click **Save** — your keys are encrypted and stored securely in your Clerk profile metadata
4. The platform uses paper trading by default — no real money is at risk

> **Note:** You can get free Alpaca paper trading keys at [alpaca.markets](https://alpaca.markets). No deposit required.

### Trading Modes

| Mode | Description |
|------|-------------|
| **Paper Trading** | Default mode — simulated orders via Alpaca's paper API. No real money. |
| **Simulation** | Internal simulation engine — no broker connection needed. |
| **Live Trading** | Real money mode — requires live Alpaca keys (Admin only). |

---

## Navigation

The platform uses a sidebar navigation with the following sections:

| Section | Icon | Access | Description |
|---------|------|--------|-------------|
| **Dashboard** | 📊 | All users | Portfolio overview, ticker cards, regime summary |
| **Prices** | 💹 | All users | Live price feed, charts, watchlist, order flow |
| **Orders** | 📋 | All users | Order history, open positions, account summary |
| **Trade** | ⚡ | Trader+ | Full trading workflow with AI recommendations |
| **Renko** | 🧱 | All users | Renko HFT pipeline (advanced) |
| **Simulate** | 🔮 | All users | Monte Carlo simulation and price projections |
| **Portfolio** | 📈 | All users | Portfolio optimization and correlation analysis |
| **P&L** | 💰 | Admin | Live P&L dashboard, equity curve, circuit breakers |
| **Admin** | 🛡️ | Admin | System health, audit logs, compliance |

### Role-Based Access

- **Viewer** — Can view dashboards and market data, cannot trade
- **Trader** — Can place orders and use the full trading workflow
- **Admin** — Full access including operational controls and kill switches

---

## Dashboard

The Dashboard provides an at-a-glance overview of your portfolio and market conditions.

### Ticker Cards

Each tracked symbol displays a card with:

- **Current Price** — Real-time last traded price
- **Regime Badge** — HMM-detected market state (Bullish/Bearish/Neutral)
- **Risk Multiplier** — Position sizing factor based on regime confidence
- **Risk Metrics** — VaR, CVaR, drawdown, volatility, Sharpe ratio
- **Recommendations** — Kelly-derived position sizing suggestions
- **AI Commentary** — LLM-generated market analysis

### Regime Summary Banner

A horizontal strip showing the current regime for all tracked tickers. Hover over any badge for an explanation of what that regime means.

### Strategy Evolution

Shows the current active strategy variant, its generation number, and A/B test results. The evolution system automatically optimizes strategy parameters over time.

---

## Price Feed & Market Data

The Price Feed is your real-time market data hub with 7 chart modes.

### Chart Modes

Switch between chart modes using the mode selector at the top:

| Mode | Description |
|------|-------------|
| **Live** | Real-time candlestick chart powered by lightweight-charts |
| **Advanced** | TradingView advanced charting with full indicator library |
| **Heatmap** | Sector performance heatmap showing relative strength |
| **Calendar** | Economic events calendar with impact ratings |
| **Flow** | Order flow / Level 2 depth ladder with bid-ask analysis |
| **Feeds** | Multi-source price aggregation with health monitoring |

### Watchlist

- **Add symbols** by typing in the search bar and clicking the + button
- **Remove symbols** by clicking the × on each ticker
- **Import/Export** — Click the import/export buttons to save or load your watchlist as JSON or CSV
- **Cloud Sync** — Click the cloud icon to sync your watchlist to your account (accessible from any device)

### Order Flow Panel (Level 2)

The Flow mode shows market microstructure:

- **Bid/Ask Ladder** — 10-level depth showing size at each price level
- **Spread** — Current bid-ask spread in basis points (bps)
- **Order Book Imbalance** — Positive = buy pressure, negative = sell pressure
- **Cumulative Delta** — Running total of buy volume minus sell volume
- **Volume Profile** — Horizontal histogram showing volume at each price level

> **Tip:** Hover over any metric with the ℹ icon for an explanation of what it means.

### Price Alerts

Set price alerts for any symbol:

1. Click the bell icon on a ticker
2. Set the target price and direction (above/below)
3. You'll receive an in-app notification when the price crosses your threshold

---

## Order Management

### Placing Orders

There are several ways to place an order:

1. **Order Modal** — Click the trade button on any ticker card or price feed row
2. **Speed Dial** — Click the floating + button (bottom-right) for quick buy/sell
3. **Trading Workflow** — Full AI-assisted trade analysis and execution

### Order Types

| Type | Description | Equity | Crypto |
|------|-------------|--------|--------|
| **Market** | Execute immediately at current market price | ✅ | ✅ |
| **Limit** | Execute only at specified price or better | ✅ | ✅ |
| **Stop** | Trigger market order when stop price is reached | ✅ | ❌ |
| **Stop Limit** | Trigger limit order when stop price is reached | ✅ | ✅ |
| **Trailing Stop** | Trail by a fixed $ or % amount from high/low | ✅ | ❌ |

### Advanced Order Classes

| Class | Description |
|-------|-------------|
| **Simple** | Standard single-leg order |
| **Bracket** | Entry + Take Profit + Stop Loss (3 legs). When one exit fills, the other cancels. |
| **OCO** | One-Cancels-Other: TP limit + SL stop. When one fills, the other cancels. Used for exits on existing positions. |
| **OTO** | One-Triggers-Other: Entry triggers a single additional order (either TP or SL, not both). |

### Risk/Reward Calculation

When placing Bracket or OCO orders, the modal automatically calculates:

- **Risk** — Dollar amount risked (entry price minus stop loss, times quantity)
- **Reward** — Dollar amount of potential profit (take profit minus entry, times quantity)
- **R:R Ratio** — Reward-to-risk ratio (e.g., 2:1 means $2 potential profit per $1 risked)

### Time-in-Force Options

| TIF | Description |
|-----|-------------|
| **Day** | Order is valid for the current trading day only |
| **GTC** | Good Till Cancelled — remains active until manually cancelled |
| **OPG** | At Open — executed at the market open auction |
| **CLS** | At Close — executed at the market close auction |
| **IOC** | Immediate or Cancel — fill as much as possible now, cancel the rest |
| **FOK** | Fill or Kill — fill the entire order immediately or cancel it completely |

### Circuit Breaker Pre-Flight

Before any order is submitted, the system runs circuit breaker checks:

- Position size limits
- Portfolio heat (total risk exposure)
- Daily loss limits
- Maximum drawdown checks
- Consecutive loss stops
- Order rate limits

If any breaker triggers, the order is blocked with a clear explanation.

### Review & Confirm

Every order goes through a two-step confirmation:

1. **Review** — Verify all order details on the confirmation screen
2. **Confirm** — Submit the order to Alpaca

---

## Portfolio

### Portfolio Overview

The top-level portfolio view shows:

| Metric | Meaning |
|--------|---------|
| **Portfolio VaR 95** | Maximum expected daily loss at 95% confidence |
| **Active Symbols** | Number of symbols with open positions |
| **Corr Regime** | Current correlation regime (see below) |
| **Exposure** | Total market value as a percentage of account equity |

### Correlation Regimes

The correlation regime describes how your portfolio's assets are moving together:

| Regime | Color | Meaning |
|--------|-------|---------|
| **Low Correlation** | 🟢 Green | Assets move independently; diversification is effective |
| **Mid Correlation** | 🟡 Yellow | Moderate co-movement; some diversification benefit remains |
| **High Correlation** | 🟠 Orange | Assets move together; diversification is limited |
| **Crisis Mode** | 🔴 Red | Extreme co-movement during market stress; risk of simultaneous losses |

> **Why it matters:** In Crisis Mode, your portfolio acts like a single position because all assets move together. The system automatically increases the risk multiplier to reduce position sizes.

### Correlation Heatmap

Visual matrix showing pairwise correlations between all portfolio holdings:

- **ρ (rho)** = Pearson correlation coefficient (-1 to +1)
- Green = low correlation (good diversification), Red = high correlation (concentrated risk)
- Hover over cells for exact values

### Portfolio Optimizer

Compares your current allocation against mathematically optimal weights:

- **Current Weights** — Your actual portfolio allocation
- **Optimal Weights** — Mean-variance optimized allocation
- **Regime-Adjusted** — Optimal weights modified for the current correlation regime
- **Drawdown Constraint** — Shows if your current drawdown is within limits (OK) or breached

---

## Trading Workflow

The Trading Workflow is the most powerful way to analyze and execute trades.

### Step-by-Step Process

1. **HMM Regime Detection** — Hidden Markov Model identifies the current market state
2. **Strategy Signals** — Buy/sell/flat signals generated based on regime and risk analysis
3. **TDA Anomaly Detection** — Topological Data Analysis detects structural anomalies in price data
4. **Kelly Position Sizing** — Calculates optimal position size using the Kelly criterion pipeline:
   - **Full Kelly** — Raw mathematically optimal bet size (aggressive)
   - **Fractional Kelly** — Reduced to half-Kelly for safety
   - **Vol-Scaled** — Adjusted for current volatility
   - **Regime-Gated** — Further reduced if risk is elevated
5. **Risk Validation** — Checks position against VaR, CVaR, and risk limits
6. **Execute** — Place the trade with one click

### Topological Analysis (TDA)

The TDA module uses algebraic topology to detect market anomalies:

| Metric | Meaning |
|--------|---------|
| **Betti-0** | Number of connected components — tracks structural complexity |
| **Betti-1** | Number of loops/holes — indicates cyclic market patterns |
| **Entropy** | Total topological entropy — measures structural disorder |
| **Anomaly Score** | ≥1.5 = anomalous, ≥2.25 = critical |
| **Regime Change Prob** | ≥60% = high probability of regime shift |

---

## Simulation & Monte Carlo

### Monte Carlo Simulation

Run thousands of simulated price paths to estimate future outcomes:

1. Select a symbol and simulation horizon
2. The system generates paths using HMM regime transitions
3. View the **Price Fan Chart** with confidence bands:
   - **Median** — Central path (50th percentile)
   - **P25–P75** — Interquartile range (50% of outcomes)
   - **P5–P95** — 90% confidence interval

### Key Simulation Metrics

| Metric | Meaning |
|--------|---------|
| **Return VaR 95** | 5th percentile of simulated returns |
| **Paths Positive** | Percentage of paths ending with gains |
| **Max DD (mean)** | Average maximum drawdown across all paths |
| **Terminal Regime** | Most likely market state at end of simulation |

---

## Operational Controls

> **Admin access required** for most operational features.

### Live P&L Dashboard

Real-time profit/loss tracking with comprehensive risk metrics:

- Realized and unrealized P&L
- Equity curve visualization
- Risk metrics panel (Sharpe, Sortino, Calmar, VaR, CVaR, etc.)
- Win rate and profit factor tracking
- VaR breach alerts

### Circuit Breakers

Risk management safeguards that automatically restrict trading:

| Breaker | What It Does |
|---------|-------------|
| Max Position Size | Limits dollar value per position |
| Max Portfolio Heat | Limits total portfolio risk exposure |
| Daily Loss Limit | Caps daily losses |
| Max Drawdown | Halts trading if drawdown exceeds threshold |
| Consecutive Loss Stop | Pauses after N consecutive losing trades |
| Max Open Positions | Limits number of concurrent positions |
| Order Rate Limit | Caps orders per minute |
| Sector Concentration | Limits % of portfolio in one sector |
| Single Stock Concentration | Limits % of portfolio in one stock |

### Kill Switch

Emergency trading halt with three scope levels:

| Scope | Effect |
|-------|--------|
| **Global** | Stops ALL trading across the entire system |
| **User** | Stops trading for a specific user |
| **Symbol** | Stops trading for a specific ticker |

### System Health

Monitors the health of all platform services:

- WebSocket connections
- API response times
- Fill poller status
- Audit trail integrity

---

## Settings

### API Key Management

- **Alpaca API Keys** — Paper trading credentials (stored encrypted in Clerk metadata)
- **Multiple credential sets** — Switch between paper and live keys
- **Validation** — Test your keys before saving

### Notification Preferences

Configure how and when you receive alerts:

- **In-app notifications** — Bell icon dropdown with unread badge
- **Quiet hours** — Suppress non-critical alerts during specified hours
- **Discord webhook** — Forward alerts to a Discord channel
- **Severity filtering** — Choose which alert types to receive

### Plan Management

| Plan | Rate Limits | Features |
|------|------------|----------|
| **Free** | 1x base limits | Paper trading, basic dashboards |
| **Premium** | 3x base limits | Advanced analytics, AI commentary |
| **Institutional** | 10x base limits | Full operational controls, kill switches |

---

## Keyboard Shortcuts

Press `?` or `Cmd/Ctrl + /` at any time to view the keyboard shortcuts overlay.

### Navigation

| Shortcut | Action |
|----------|--------|
| `⌘ + 1` | Dashboard |
| `⌘ + 2` | Prices |
| `⌘ + 3` | Orders |
| `⌘ + 4` | Trade |
| `⌘ + 5` | Renko |
| `⌘ + 6` | Simulate |
| `⌘ + 7` | Portfolio |
| `⌘ + 8` | P&L (Admin) |
| `⌘ + 9` | Admin |
| `⌘ + 0` | Settings |

### Trading

| Shortcut | Action |
|----------|--------|
| `T` | Open quick trade |
| `B` | Quick buy (opens order modal in buy mode) |
| `S` | Quick sell (opens order modal in sell mode) |

### General

| Shortcut | Action |
|----------|--------|
| `?` | Show keyboard shortcuts |
| `Esc` | Close modal / overlay |

---

## Glossary

### Risk Metrics

| Term | Definition |
|------|-----------|
| **VaR (Value at Risk)** | Maximum expected loss at a given confidence level. VaR 95% means "on 95% of days, losses won't exceed this amount." |
| **CVaR (Conditional VaR)** | Average loss when VaR is exceeded. Also called Expected Shortfall. Always worse than VaR. |
| **Max Drawdown** | Largest peak-to-trough decline in portfolio value. The worst loss from a high point. |
| **Sharpe Ratio** | Risk-adjusted return: excess return divided by total volatility. >1.0 is strong, <0.5 is weak. |
| **Sortino Ratio** | Like Sharpe but only penalizes downside volatility. Better for asymmetric return distributions. |
| **Calmar Ratio** | Annual return divided by max drawdown. Measures return per unit of worst-case risk. |
| **Annual Volatility** | Standard deviation of returns annualized. Higher = more unpredictable. |
| **Profit Factor** | Gross profits divided by gross losses. >1.0 = profitable system. |
| **Win Rate** | Percentage of trades that closed profitably. |

### Regime & Strategy

| Term | Definition |
|------|-----------|
| **HMM (Hidden Markov Model)** | Statistical model that identifies hidden market states (bullish/bearish/neutral) from observable price data. |
| **Regime** | Current market state detected by the HMM — determines strategy behavior. |
| **Correlation Regime** | How portfolio assets co-move: Low (diversified), Mid, High, Crisis (all move together). |
| **Risk Multiplier** | Scales position sizes based on regime confidence. ≥1.0 = elevated risk, <0.5 = reduced. |
| **Kelly Criterion** | Mathematically optimal bet size that maximizes long-term growth. Often reduced to "half-Kelly" for safety. |
| **Fractional Kelly** | Kelly fraction reduced for safety (typically 50% of full Kelly). |
| **Regime-Gated** | Position sizing further reduced when the HMM regime indicates elevated risk. |

### Trading

| Term | Definition |
|------|-----------|
| **PDT (Pattern Day Trader)** | SEC designation for accounts executing 4+ day trades in 5 business days. Requires $25K minimum equity. |
| **Buying Power** | Total capital available for opening new positions, including margin. |
| **Level 2 (L2)** | Order book depth showing bid and ask sizes at multiple price levels beyond the best bid/ask. |
| **Basis Points (bps)** | 1 bps = 0.01%. Used to measure bid-ask spread tightness. |
| **Cumulative Delta** | Running total of buy-initiated volume minus sell-initiated volume. Positive = buying pressure. |
| **Order Book Imbalance** | Asymmetry between bid and ask side volume. Positive = buy pressure, negative = sell pressure. |

### Advanced Analytics

| Term | Definition |
|------|-----------|
| **TDA (Topological Data Analysis)** | Mathematical analysis of data shape using algebraic topology. Detects structural changes in market data. |
| **Betti Numbers** | Topological invariants: Betti-0 counts connected components, Betti-1 counts loops/holes. |
| **ATR (Average True Range)** | Average of true price ranges over N periods. Measures volatility. |
| **HHLL Score** | Higher-High/Lower-Low score — measures trend strength via recent price extremes. |
| **Masaniello Pressure** | Position sizing pressure f×(1−f), where f is the Kelly fraction. Peaks at half-Kelly (0.25). |
| **Monte Carlo Simulation** | Random sampling method to model probability of different outcomes. |
| **Walk-Forward Analysis** | Out-of-sample testing that rolls forward through time, preventing look-ahead bias. |

---

## Getting Help

- **Hover over any ℹ icon** for inline explanations of metrics and terms
- **Press `?`** to view keyboard shortcuts
- **Check the Notification Center** (bell icon) for system alerts and trade notifications

---

*Noble Trader uses the Alpaca paper trading API. All trades are simulated. This is not financial advice.*
