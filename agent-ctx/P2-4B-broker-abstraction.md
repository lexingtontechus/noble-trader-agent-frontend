# P2-4B: Broker Abstraction

## Task Summary
Implemented a broker abstraction layer for the noble-trader-agent-frontend project, allowing future brokers (Interactive Brokers, TD Ameritrade, etc.) to be added without modifying existing code.

## Files Created

### 1. `src/lib/brokers/index.js` — Broker Interface
- Defines `BROKER_METHODS` — list of 9 methods all adapters must implement
- Defines `BROKER_IDS` — canonical broker identifiers (`alpaca_paper`, `alpaca_live`)
- Defines `READ_ACTIONS` / `WRITE_ACTIONS` / `ALL_ACTIONS` for route-level access control
- Provides `validateBrokerAdapter()` — runtime check that adapter implements all methods
- Provides `brokerError()` / `brokerSuccess()` — standard `{ data, error }` response format

### 2. `src/lib/brokers/alpaca-adapter.js` — Alpaca Adapter
- `createAlpacaBroker({ apiKey, secretKey, mode })` factory function
- Wraps existing `alpaca-client.js` functions into the broker interface
- Implements all 9 BROKER_METHODS: getAccount, getPositions, getOrders, createOrder, cancelOrder, getPortfolioHistory, getActivities, getAsset, validateCredentials
- **cancelOrder(orderId)** — NEW, uses `alpacaFetch` with DELETE method (was missing from original client)
- **getAsset(symbol)** — NEW, calls GET /v2/assets/{symbol} to check tradeability
- **validateCredentials()** — NEW, calls getAccount() and checks response
- Error normalization: maps Alpaca-specific error patterns to standard codes
- Audit logging: every method logs success/failure with context

### 3. `src/lib/brokers/broker-factory.js` — Broker Factory
- `createBroker({ brokerId, credentials })` — resolves adapter by broker ID
- `getBrokerIdFromCredentialType('paper'|'live')` — bridges credential types to broker IDs
- `isSupportedBroker(brokerId)` — checks if a broker ID is supported

### 4. `src/app/api/broker/[action]/route.js` — Dynamic BFF Route
- GET handler: viewer+ access for read actions
- POST handler: trader+ access for write actions
- 9 supported actions: account, positions, orders, portfolio-history, activities, validate, asset, create-order, cancel-order
- Uses `withAuth()` for authentication and RBAC
- Resolves broker credentials via `resolveBrokerConfig()`
- Creates broker adapter via factory
- Delegates action to adapter with proper params (query string for reads, body for writes)

## Files Modified

### 5. `src/lib/alpaca-credentials.js` — Added Broker Helpers
- Added imports: `BROKER_IDS` from brokers/index, `getBrokerIdFromCredentialType` from brokers/broker-factory
- **`resolveBrokerId(request)`** — returns broker ID based on user's credential type
- **`resolveBrokerConfig(request)`** — returns `{ brokerId, credentials }` ready for the factory
- Existing functions (`getAlpacaCredentialKeys`, `resolveCredentialType`) unchanged for backward compatibility

## Zero Breaking Changes
- All existing `/api/alpaca/*` and `/api/trading/*` routes untouched
- `alpaca-client.js` untouched — the adapter wraps it, doesn't replace it
- The new `/api/broker/*` route is an ALTERNATIVE path, not a replacement
- Existing `alpaca-credentials.js` exports remain backward compatible

## Verification
- Dev server starts successfully
- `/api/broker/account` returns 401 (correct — requires auth)
- All new files pass syntax checks
