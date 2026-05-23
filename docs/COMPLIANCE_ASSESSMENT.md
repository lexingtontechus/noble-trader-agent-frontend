# Noble Trader — Compliance Assessment Report

> **Version 7.0.0** | FINRA / SEC / Dodd-Frank / GDPR Regulatory Gap Analysis
> **Date:** May 23, 2026 | **Classification:** Confidential
> **Scope:** Frontend (Next.js BFF) + Backend (Python FastAPI) + Infrastructure

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Risk Summary](#2-risk-summary)
3. [Regulatory Framework Applicability](#3-regulatory-framework-applicability)
4. [Existing Compliance Controls](#4-existing-compliance-controls)
5. [Critical Compliance Gaps](#5-critical-compliance-gaps)
6. [High-Risk Compliance Gaps](#6-high-risk-compliance-gaps)
7. [Medium-Risk Compliance Gaps](#7-medium-risk-compliance-gaps)
8. [Recommended Remediation Actions](#8-recommended-remediation-actions)
9. [Paper Trading Safe Harbor Analysis](#9-paper-trading-safe-harbor-analysis)
10. [Conclusion](#10-conclusion)

---

## 1. Executive Summary

This compliance assessment evaluates the Noble Trader institutional paper trading platform against the regulatory requirements of FINRA, the U.S. Securities and Exchange Commission (SEC), Dodd-Frank, and the EU General Data Protection Regulation (GDPR). The platform operates in a hybrid architecture: a Next.js frontend serving as a BFF (Backend-for-Frontend) layer with direct Alpaca API integration, and a Python FastAPI backend for regime detection and risk analytics. The platform currently defaults to paper trading via Alpaca, which limits direct regulatory exposure for end users. However, the architecture fully supports live trading, and several critical compliance gaps exist that would expose the platform operator to significant legal and regulatory liability if live trading were activated without remediation.

The assessment identifies **8 critical gaps**, **6 high-risk gaps**, and **5 medium-risk gaps** across regulatory domains including order handling, short sale restrictions, market manipulation prevention, supervisory procedures, recordkeeping, and data privacy. The platform demonstrates surprisingly strong operational controls (circuit breakers, kill switches, audit logging, reconciliation) but lacks the regulatory-specific controls that FINRA and SEC require for broker-dealer platforms facilitating order routing and execution.

---

## 2. Risk Summary

| Domain | Critical | High | Medium | Status |
|--------|----------|------|--------|--------|
| PDT / Day Trading Rules | 1 | 0 | 0 | No enforcement |
| Reg SHO / Short Sales | 1 | 0 | 0 | No controls |
| Market Manipulation | 0 | 1 | 0 | No detection |
| Supervisory Procedures | 0 | 1 | 0 | No WSP / compliance officer |
| Recordkeeping (17a-4) | 0 | 1 | 0 | 1-year retention (need 6yr) |
| Order Handling / Best Ex | 0 | 1 | 0 | No position/buying power check |
| Risk Disclosures | 0 | 0 | 1 | Partial disclaimers |
| Data Privacy / GDPR | 0 | 0 | 1 | Strong but gaps remain |
| Audit Trail Integrity | 1 | 0 | 0 | Tamper risk, silent drops |
| Backend Compliance | 1 | 0 | 0 | No audit, no encryption |
| **Totals** | **4** | **4** | **2** | |

---

## 3. Regulatory Framework Applicability

The Noble Trader platform routes orders through Alpaca Securities LLC, a FINRA-registered broker-dealer. While Alpaca bears primary regulatory responsibility for order execution and clearing, the platform operator may be considered an "introducing broker" or "investment adviser" depending on the nature of the advisory services provided. The following regulatory frameworks apply to varying degrees based on the platform operational model and the services offered to users.

### 3.1 SEC Regulations

| Regulation | Applicability | Key Requirements |
|-----------|---------------|-----------------|
| Securities Exchange Act §15(c) | **High** | Broker-dealer registration, customer protection, best execution obligations |
| Reg SHO (Rule 200-204) | **High** | Short sale price tests, locate requirements, threshold list monitoring, fail-to-deliver tracking |
| Reg NMS (Rule 601-607) | **Medium** | Order protection rule, access rule, market data rules, best execution |
| Reg T / Margin Rules | **High** | Initial margin requirements, maintenance margin, buying power calculations |
| Rule 17a-4 (Recordkeeping) | **High** | 6-year retention of order records, WORM storage, tamper-evident audit trails |
| Investment Advisers Act | **Medium** | Fiduciary duty, disclosure of conflicts, Form ADV requirements if advisory services |
| Dodd-Frank Section 747 | **High** | Anti-spoofing provisions, market manipulation detection and prevention |

### 3.2 FINRA Rules

| Rule | Applicability | Key Requirements |
|------|---------------|-----------------|
| Rule 2160 (PDT) | **Critical** | Pattern day trader identification, $25K minimum equity, day trade counting |
| Rule 3110 (Supervision) | **High** | Written supervisory procedures, compliance officer designation, annual compliance meeting |
| Rule 3120 (Compliance) | **High** | Annual compliance report, testing and verification of supervisory procedures |
| Rule 4512 (Customer Account) | **Medium** | Customer account information, suitability documentation, account types |
| Rule 5310 (Best Execution) | **High** | Best execution obligations, regular review of execution quality, order routing analysis |

### 3.3 GDPR (EU)

| Article | Applicability | Key Requirements |
|---------|---------------|-----------------|
| Article 5 (Principles) | **High** | Lawfulness, purpose limitation, data minimization, accuracy, storage limitation |
| Article 17 (Right to Erasure) | **Medium** | Self-service deletion request mechanism |
| Article 20 (Data Portability) | **Medium** | Machine-readable export of all user data |
| Article 32 (Security) | **High** | Encryption at rest, pseudonymization, breach notification |

---

## 4. Existing Compliance Controls

The platform implements a surprisingly robust operational compliance layer for a retail-facing SaaS product. The following controls are currently in production and functioning correctly, though several have implementation issues that reduce their effectiveness.

### 4.1 Audit Logging

**File:** `src/lib/audit-logger.js`

| Aspect | Detail |
|--------|--------|
| **Events logged** | 20 event types: ORDER_SUBMITTED/FILLED/REJECTED/CANCELLED, CIRCUIT_BREAKER_TRIGGERED/CHECK, HALT_ACTIVATED/DEACTIVATED, KILL_SWITCH_ACTIVATED/DEACTIVATED, CAMPAIGN_*, MODE_CHANGED, RECONCILIATION_PASSED/FAILED |
| **Data captured** | event_type, user_id, org_id, symbol, order_id, direction, quantity, price, order_type, regime, strategy, signal_score, risk_metrics (JSON), metadata (JSON) |
| **Immutability** | Claimed immutable — UPDATE/DELETE prevented by triggers in migration 14. The triggers must be verified in the actual migration file. |
| **Retention** | Hot: 90 days, Archive: 365 days total (configurable in `retention.js`) |
| **Design** | Fire-and-forget (never blocks execution). If DB is down, events are **silently dropped** with a console log. |

**Issues:**
- **Silent event loss**: If `SUPABASE_SERVICE_ROLE_KEY` is not configured, all audit events are dropped. No local buffer or retry mechanism.
- **No integrity hashing**: Events are not cryptographically signed or chained. A database admin with service role access could modify records undetected.
- **No sequencing**: No monotonically increasing sequence number to detect missing events.

### 4.2 Circuit Breakers

**File:** `src/lib/circuit-breaker.js`

| Breaker Type | Default Threshold | Action | Cooldown |
|-------------|-------------------|--------|----------|
| max_position_size | 25% of equity | reject_order | 30 min |
| max_open_positions | 10 positions | reject_order | 30 min |
| daily_loss_limit | -2% | **halt** | 60 min |
| max_drawdown | -5% | **halt** | 60 min |
| consecutive_loss_stop | 3 consecutive | **halt** | 60 min |
| order_rate_limit | 10/min | reject_order | 5 min |
| single_stock_concentration | 20% of equity | reject_order | 30 min |
| max_portfolio_heat | 50% | **halt** | 60 min |
| sector_concentration | 30% | **alert** (allows trade) | 30 min |

**Issues:**
- **Fail-open design** (line 573): `checkCircuitBreakers()` returns `{ allowed: true }` on unexpected errors. A bug in the CB engine bypasses all risk controls.
- **isHalted() also fails open** (line 134): If DB is down, returns `{ halted: false }`.
- **Buggy trigger recording** (line 587): `trigger_count: Math.random() > -1 ? undefined : 0` — this always evaluates to `undefined` (Math.random() is always > -1), meaning trigger counts are **never actually incremented**.
- **Hardcoded defaults**: All threshold values are hardcoded in `DEFAULT_BREAKERS`. They should be configurable per-user via DB (which the code supports) but defaults are not sourced from environment variables.
- **No PDT check**: Circuit breakers do not check Pattern Day Trader status or equity minimums.

### 4.3 Kill Switch

**File:** `src/components/operational/KillSwitchPanel.jsx`

| Halt Scope | Description |
|-----------|-------------|
| `global_halt` | Halts ALL trading for ALL users |
| `user_halt` | Halts trading for a specific user |
| `symbol_halt` | Halts trading for a specific symbol |

**Trigger methods:** Manual (UI with 2-step confirmation), automatic via circuit breakers, automatic via reconciliation failure. Reason codes: manual, circuit_breaker, max_drawdown, data_feed_error, compliance, reconciliation_failure. Emergency actions: Cancel All Open Orders, Close All Positions (at market).

**Issues:**
- **No MFA/2FA on kill switch deactivation**: Any admin can deactivate halts without additional verification.
- **No auto-expiry**: Halts remain active indefinitely until manually deactivated. No TTL or auto-resume mechanism.
- **Audit gap**: Kill switch activation IS logged via `logAuditEvent`, but deactivation API route needs verification that it also logs.

### 4.4 Encryption and Data Privacy

**File:** `src/lib/encryption.js`

| Aspect | Implementation |
|--------|---------------|
| **API key encryption** | AES-256-GCM with PBKDF2 key derivation (100,000 iterations) |
| **Key versioning** | V1 through V10 for rotation support |
| **Auto re-encryption** | On read when key version changes |
| **PII hashing** | SHA-256 with pepper for IP addresses |
| **GDPR erasure** | Purges across 14 tables with erasure audit trail |

**Issues:**
- **Clerk privateMetadata stores API keys UNENCRYPTED** (`src/lib/clerk-metadata.js` lines 51-56). The `setAlpacaKeys()` function stores raw key/secret in `privateMetadata`. This is the legacy fallback path.
- **`hashPII` default pepper** (encryption.js line 298): If `SUPABASE_ENCRYPTION_KEY` is not set, falls back to `"default-pepper-change-me"` — a hardcoded, publicly visible pepper.
- **No self-service GDPR**: Users cannot request data deletion or export (GDPR Articles 17, 20).

### 4.5 Reconciliation

**File:** `src/lib/reconciliation.js`

Three-way reconciliation: Audit log (expected) ↔ Audit fills ↔ Alpaca actual fills. Price discrepancy detection (0.5% tolerance). Quantity mismatch detection. Missing fill detection. Phantom fill detection. Stale order detection (30 min). Auto-halt on critical discrepancies (>3 discrepancies or any phantom fills). Auto-reconciliation scheduling (default 16:05 ET). CSV export supported.

**Issues:**
- **Relies on audit log completeness** — if events were silently dropped, reconciliation produces false positives.
- **No broker statement comparison** — only reconciles against Alpaca API, not against monthly broker statements.

### 4.6 Rate Limiting

**File:** `src/lib/rate-limiter.js`

| Tier | Max Requests | Window |
|------|-------------|--------|
| trade | 10 | 60s |
| order | 15 | 60s |
| backtest | 5 | 300s |
| ai | 10 | 60s |
| write | 10 | 60s |
| data | 60 | 60s |
| admin | 30 | 60s |

Plan multipliers: Free=1x, Premium=3x, Institutional=10x. Redis-backed with in-memory fallback. Per-user + per-IP rate limiting. Rate limit headers (X-RateLimit-*) on all responses.

**Issues:**
- In-memory fallback is unreliable on serverless (Vercel cold starts reset state).
- Rate limit violations stored with hashed IP only — cannot correlate repeat abusers across IP changes.

### 4.7 Data Retention

**File:** `src/lib/retention.js`

| Table | Hot Retention | Archive Retention | GDPR Purge |
|-------|--------------|-------------------|------------|
| trade_audit_log | 90 days | 365 days total | Yes |
| rate_limit_violations | 30 days | 90 days total | Yes |
| reconciliation_results | 90 days | 365 days total | Yes |
| portfolio_snapshots | 365 days | 1,825 days (5yr) | Yes |

Auto-archival via pg_cron job at 3 AM UTC. Manual "Run Retention Jobs" trigger available.

---

## 5. Critical Compliance Gaps

### 5.1 Pattern Day Trader (PDT) Rules

**Regulatory Basis:** SEC Rule 2520, FINRA Rule 2160

A pattern day trader is defined as any account that executes four or more day trades within five business days, provided that the number of day trades represents more than 6% of the total trades in the account during that period. PDT accounts must maintain a minimum equity of $25,000 at all times. If equity falls below this threshold, the account is restricted to closing transactions only until the minimum is restored.

**Current State:** The AccountSummary component displays a PDT badge when Alpaca flags the account, but this is purely informational. There is:

- No server-side PDT status check before order execution
- No day trade counter to track the 3-in-5-day threshold
- No $25K minimum equity enforcement for PDT accounts
- No PDT warning when approaching the threshold
- The order creation API route (`/api/alpaca/orders/create`) performs no PDT-related validation whatsoever

**Risk:** Enabling PDT accounts to place trades without equity verification violates FINRA Rule 2160 and exposes the platform to regulatory sanctions, fines, and potential account restrictions imposed by Alpaca. While Alpaca server-side validation may reject some PDT violations, reliance on broker-side rejection is insufficient for regulatory compliance by the platform operator.

### 5.2 Reg SHO / Short Sale Restrictions

**Regulatory Basis:** SEC Regulation SHO (Rules 200-204)

Reg SHO requires that before effecting a short sale, a broker-dealer must either borrow or arrange to borrow the security (locate requirement), or have reasonable grounds to believe the security can be borrowed. Short Sale Restrictions (SSR) trigger when a stock drops 10% or more in one day, requiring short sales at or above the national best bid. Threshold securities must be closely monitored for fail-to-deliver positions.

**Current State:** The platform has **zero** Reg SHO compliance controls:

- No locate requirement check before short sales
- No hard-to-borrow list integration
- No Short Sale Restriction (SSR) check
- No threshold list monitoring
- No fail-to-deliver tracking
- The order creation route accepts "sell" as a valid side without verifying whether the user holds the position, effectively allowing naked short sales through the platform UI

**Risk:** Facilitating short sales without Reg SHO compliance is a direct violation of SEC rules and can result in enforcement actions, significant fines, and potential criminal liability for willful violations. This is the single highest regulatory risk in the platform.

### 5.3 Audit Trail Integrity

**Regulatory Basis:** SEC Rule 17a-4, FINRA Rule 4511

SEC Rule 17a-4 requires broker-dealers to preserve records in a WORM (Write Once Read Many) format that prevents alteration or deletion for 6 years. FINRA Rule 4511 requires books and records to be maintained in a manner that preserves their integrity.

**Current State:** While the audit logger claims immutability via database triggers, several issues undermine this:

- The triggers must be verified in the actual migration file (migration 14)
- There is no cryptographic hashing or chaining of entries
- Any Supabase service-role user can modify records
- The Python backend has no persistent audit trail at all (logs go to stdout only)
- Audit events are silently dropped if the database is unavailable with no local buffer or retry
- Trade audit logs are retained for only 1 year total, whereas SEC 17a-4 requires 6 years for order-related records

### 5.4 Backend Compliance Void

**Current State:** The Python FastAPI backend has no compliance controls whatsoever:

- No persistent audit trail — logs go to stdout/stderr only
- No trade execution logging that persists to a database
- No access audit trail — no log of who accessed what and when
- No encryption at rest for stored data
- `AUTH_ENABLED=false` creates an admin account with full access if deployed without configuration
- Backend credentials table stores API keys in plaintext per documentation
- The only access control is JWT-based with no compliance-specific roles

---

## 6. High-Risk Compliance Gaps

### 6.1 Market Manipulation Detection

**Regulatory Basis:** Dodd-Frank Section 747, SEC Section 9(a)

The platform has zero detection or prevention mechanisms for manipulative practices:

- No spoofing detection (placing orders with intent to cancel)
- No layering detection (multiple orders at different price levels to create false impression)
- No wash trade prevention (trading with self)
- No front-running detection
- No unusual order pattern monitoring
- No volume spike alerts relative to normal trading patterns

While the order rate limiter (10/min) provides some throttling, it is not designed as a manipulation safeguard.

### 6.2 Supervisory Procedures

**Regulatory Basis:** FINRA Rules 3110, 3120

FINRA requires written supervisory procedures (WSP), a designated compliance officer, regular compliance testing, and annual compliance meetings. The platform has none of these:

- No compliance officer role — the "admin" role has no special compliance designation
- No supervisor approval workflow — trades execute immediately without review
- No trade review queue — no mechanism for pre-trade approval by a supervisor
- No exception reporting — no automated reports for unusual activity
- No compliance officer dashboard — no centralized view of regulatory concerns
- No written supervisory procedures (WSP) — no documentation of supervisory workflows

### 6.3 Order Handling Deficiencies

The order creation route performs extensive validation including symbol tradeability, order type restrictions, and circuit breaker pre-flight checks. However, it lacks several critical pre-trade checks:

- No position verification before sell orders (allowing sales of unheld positions)
- No buying power verification beyond relying on Alpaca server-side checks
- No duplicate order detection (same order could be submitted multiple times)
- No order size limits beyond circuit breakers
- Reg NMS best execution obligations require regular review of execution quality, which is not currently implemented

### 6.4 Recordkeeping Retention

SEC Rule 17a-4 requires 6-year retention of order-related records in WORM storage. The current retention policy archives trade audit logs for only 365 days total, far short of the 6-year requirement. Portfolio snapshots are retained for 5 years which is closer to compliance, but order details are not stored locally at all — they are fetched from Alpaca on demand. If Alpaca purges historical order data, the platform would have no independent record of trade execution details, which is a direct violation of recordkeeping requirements.

---

## 7. Medium-Risk Compliance Gaps

### 7.1 Risk Disclosures

The platform includes several risk disclaimers: a "Not financial advice" tag on AI commentary, a "Paper trading only" notice in the OrderModal, and a footer disclaimer about educational purposes. However, these are insufficient for regulatory compliance. Missing disclosures include:

- A comprehensive risk disclosure page covering trading risks, margin risks, and automated trading risks
- A prominent "You are trading with real money" warning when live mode is activated
- SEC-required language about risks of trading, margin, and options
- An AI recommendation disclaimer referencing that AI-generated content is not personalized investment advice
- Risk disclosures in the onboarding wizard about the risks of automated trading strategies

### 7.2 GDPR Compliance Gaps

The GDPR implementation is strong in several areas (encryption at rest, right to erasure, IP hashing) but has specific gaps:

- No self-service data deletion request mechanism (GDPR Article 17)
- No data portability export in machine-readable format (GDPR Article 20)
- The erasure function deletes rather than anonymizes, which may conflict with recordkeeping requirements
- Clerk privateMetadata stores Alpaca API keys in plaintext as a legacy fallback
- The default pepper for `hashPII` is hardcoded and publicly visible in source code

### 7.3 Circuit Breaker Bug

The trigger count bug on line 587 of `circuit-breaker.js` means that the circuit breaker system cannot track how many times each rule has been triggered. This affects escalation logic, cooldown calculations, and compliance reporting. Additionally, the fail-open design where circuit breaker errors allow trades to proceed may be acceptable for paper trading but creates liability for live trading. The hardcoded default thresholds should also be configurable via environment variables or a per-user settings database.

### 7.4 Hardcoded Configuration Values

| Value | File | Current |
|-------|------|---------|
| CB default thresholds | `circuit-breaker.js` | All hardcoded |
| Recon price tolerance | `reconciliation.js` | 0.5% (env-overridable) |
| Recon stale threshold | `reconciliation.js` | 30 min (env-overridable) |
| PBKDF2 iterations | `encryption.js` | 100,000 |
| Retention periods | `retention.js` | All hardcoded |
| Rate limit tiers | `rate-limiter.js` | All hardcoded |
| `hashPII` default pepper | `encryption.js` | "default-pepper-change-me" |

### 7.5 Data Stored Without Encryption

| Data | Location | Risk |
|------|----------|------|
| API keys in Clerk privateMetadata | Clerk user metadata | Plaintext Alpaca keys |
| Backend credentials table | Supabase `credentials` | Per docs: "Plain text" |
| User email/name in JWT | ClerkTokenData claims | PII in transit |
| Audit log metadata JSON | Supabase `trade_audit_log` | Contains trade details |

---

## 8. Recommended Remediation Actions

The following actions are prioritized by regulatory risk and implementation complexity. Actions marked as **P0** should be completed before any live trading activation. **P1** actions should follow within 30 days, and **P2** actions within 90 days.

### P0 — Must Fix Before Live Trading

| # | Action | Regulatory Basis | Effort |
|---|--------|-----------------|--------|
| 1 | Implement PDT day-trade counter + $25K equity gate | FINRA 2160, SEC 2520 | 3-5 days |
| 2 | Add Reg SHO locate requirement + HTB check + SSR before short sales | SEC Reg SHO | 5-7 days |
| 3 | Add position verification before sell orders | Best execution, Reg SHO | 1-2 days |
| 4 | Fix circuit breaker trigger count bug (line 587) | Risk management | 0.5 days |
| 5 | Add tamper-evident audit trail (hash chaining + sequence numbers) | SEC 17a-4 | 3-5 days |
| 6 | Add backend audit logging with persistent storage | SEC 17a-4, FINRA 4511 | 3-5 days |

### P1 — Within 30 Days

| # | Action | Regulatory Basis | Effort |
|---|--------|-----------------|--------|
| 7 | Implement spoofing / wash trade detection | Dodd-Frank 747, SEC 9(a) | 5-10 days |
| 8 | Add compliance officer role + supervisor approval workflow | FINRA 3110, 3120 | 7-10 days |
| 9 | Extend audit retention to 6 years (17a-4 WORM) | SEC 17a-4 | 2-3 days |
| 10 | Store order details locally (not just audit event ID) | SEC 17a-4 | 3-5 days |
| 11 | Encrypt backend credentials at rest | Data protection | 2-3 days |
| 12 | Migrate Clerk privateMetadata plaintext keys to encrypted storage | Data protection, GDPR | 3-5 days |

### P2 — Within 90 Days

| # | Action | Regulatory Basis | Effort |
|---|--------|-----------------|--------|
| 13 | Add comprehensive risk disclosure page | SEC / FINRA | 3-5 days |
| 14 | Add live trading mode prominent warning | Investor protection | 1 day |
| 15 | Implement GDPR self-service data portability + deletion | GDPR Art. 17, 20 | 5-7 days |
| 16 | Make CB thresholds configurable via env/DB | Operational | 1-2 days |
| 17 | Add duplicate order detection (idempotency key) | Market integrity | 2-3 days |

---

## 9. Paper Trading Safe Harbor Analysis

The platform currently defaults to paper trading via Alpaca, which provides significant regulatory safe harbor. Paper trading accounts are not subject to PDT rules (FINRA Rule 2160 applies to margin accounts only), Reg SHO locate requirements (no actual settlement occurs), and most recordkeeping requirements (no actual securities transactions). However, several areas remain exposed even under paper trading:

1. **Investment Advisers Act**: If the platform provides AI-driven investment recommendations, the Act may apply regardless of whether trades are paper or live, as the regulatory focus is on the advisory relationship rather than the execution venue.

2. **GDPR obligations**: Apply to any personal data processing regardless of trading mode. The platform processes user API keys, email addresses, and trading activity data.

3. **Risk disclosures**: Legally prudent even for paper trading to manage user expectations and limit tort liability. Users may make real financial decisions based on paper trading results.

4. **Operational correctness**: The circuit breaker and reconciliation systems are important even in paper mode to ensure the platform behaves correctly as it would in live mode, as users rely on accurate paper trading results for strategy development.

5. **AI advisory risk**: The CommentaryCard provides AI-generated market analysis with a minimal disclaimer. If users interpret this as personalized investment advice, the platform could face liability even in paper trading mode.

---

## 10. Conclusion

The Noble Trader platform demonstrates strong operational discipline with its circuit breaker system, kill switch, reconciliation engine, and audit logging framework. These are not trivial implementations and indicate a mature engineering approach to risk management. However, the platform has critical gaps in regulatory-specific compliance that must be addressed before live trading can be safely activated.

**The most urgent priorities are:**

1. Implementing PDT equity checks (FINRA 2160)
2. Adding Reg SHO short sale restrictions (SEC Reg SHO)
3. Building tamper-evident audit trails (SEC 17a-4)
4. Fixing the circuit breaker trigger count bug immediately
5. Adding backend audit logging with persistent storage

The recommended remediation timeline of P0 (immediate), P1 (30 days), and P2 (90 days) provides a practical path to compliance that balances regulatory requirements with development velocity. Until these gaps are closed, the platform should remain in paper trading mode with clear disclaimers that simulated results do not represent actual trading performance.

**Estimated total remediation effort:** 45-70 developer-days across all priority levels.

---

*Noble Trader uses the Alpaca paper trading API. This assessment is for internal compliance planning purposes only and does not constitute legal advice. Consult with a securities law attorney before activating live trading.*
