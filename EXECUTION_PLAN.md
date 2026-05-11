---

## 📋 EXECUTION_PLAN.md — Save This File

```markdown
# Noble Trader Agent — Execution Plan

## Rules (MUST FOLLOW)
- **DO NOT** delete `proxy.js` or `.env.local` in the frontend project
- **Always** refer to this MD file for tasks
- **Always** update this MD file when tasks are completed
- **Always** use parallel agents for development
- **FastAPI backend** is on the free plan and experiences time-out when inactive
- **Deploy to GitHub** when each phase is completed
- **Wait for confirmation** before progressing to next phase
- Use **feature branches** and merge via PRs

## Key References
- **FastAPI Backend**: `https://noble-trader-fastapi-backend.onrender.com` (free plan, cold start ~30s)
- **FastAPI Backend Docs**: `https://noble-trader-fastapi-backend.onrender.com/docs`
- **Frontend Vercel**: `noble-trader-agent-frontend.vercel.app`
- **GitHub Frontend**: `lexingtontechus/noble-trader-agent-frontend`
- **GitHub Backend (READ ONLY)**: `0x596173734972/MarketRegimeTrader`
- **Alpaca Paper Trading**: Account `PA3C5BJY2CWK`
- **Supabase**: Project `pcvscowltlrxzgxjurcr`, Region `us-west-1`
- **Telegram Bot Token**: configured in .env.local

---

## Phase 1: Wrap Backend Models as FastAPI Endpoints
**Status**: ✅ Completed & Deployed

### Goal
Expose the MarketRegimeTrader Python models as REST API endpoints so the Next.js frontend can call them.

### Endpoints Created
| Endpoint | Method | Description | Backend Model | Status |
|----------|--------|-------------|---------------|--------|
| `/regime/detect-v2` | POST | HMM regime detection (2-4 states, auto-labeled) | `models/hmm_model.py` | ✅ |
| `/strategy/signal` | POST | Strategy signals + position sizes | `strategies/*.py` + `sizing/kelly.py` | ✅ |
| `/risk/analyze` | POST | Full risk analysis (VaR/CVaR, stress tests) | `risk/risk_engine.py` | ✅ |
| `/backtest/run` | POST | Backtest with strategy (30+ metrics) | `backtesting/*.py` | ✅ |
| `/tda/features` | POST | TDA feature extraction (persistent homology) | `tda/*.py` | ✅ |
| `/observation/build-v2` | POST | 24+ feature observation vector | Feature engineering pipeline | ✅ |

### Tasks
- [x] Create FastAPI endpoint files in the backend repo
- [x] Wire up HMM model to `/regime/detect-v2`
- [x] Wire up strategy models + Kelly sizing to `/strategy/signal`
- [x] Wire up risk engine to `/risk/analyze`
- [x] Wire up backtesting engine to `/backtest/run`
- [x] Wire up TDA module to `/tda/features`
- [x] Wire up observation builder to `/observation/build-v2`
- [x] Add request/response schemas (Pydantic)
- [x] Test all endpoints (local functional test passed)
- [x] Deploy to Render (auto-deployed via GitHub merge to main, confirmed live 2026-05-11)
- [x] Deploy to GitHub (merged feature/phase1-endpoints → main on 2026-05-11)

---

## Phase 2: Upgrade the Trading Workflow Pipeline
**Status**: ✅ Completed & Deployed

### Goal
Replace the current simple analyze route with a full pipeline: HMM → Strategy → Kelly → Risk → Recommendation

### Tasks
- [x] Update `/api/trading/analyze` route to call new FastAPI endpoints
- [x] Chain: Regime Detection → Strategy Signal → Position Sizing → Risk Check
- [x] Enhance `TradeRecommendation` schema with regime, strategy, kelly data
- [x] Update `TradingWorkflow.jsx` to display new data fields
- [x] Add regime indicator UI (bull/bear/neutral/sideways)
- [x] Add strategy confidence scores
- [x] Add Kelly position sizing display
- [x] Test full pipeline end-to-end
- [x] Deploy to GitHub (merged to main on 2026-05-11)

---

## Phase 3: Walk-Forward Validation Before Execution
**Status**: 🔲 Not Started

### Goal
Run walk-forward optimization before executing any trade to validate strategy parameters

### Tasks
- [ ] Create `/api/trading/validate` route that calls `/backtest/run` + optimization
- [ ] Implement validation gate: trades must pass walk-forward test
- [ ] Add validation status to TradeRecommendation schema
- [ ] Update UI to show validation results
- [ ] Add "Validate" button on individual recommendations
- [ ] Auto-validate on approve
- [ ] Test with historical data
- [ ] Deploy to GitHub

---

## Phase 4: TDA Early Warning System
**Status**: 🔲 Not Started

### Goal
Use Topological Data Analysis for market regime change detection and early warnings

### Tasks
- [ ] Create cron job that periodically calls `/tda/features`
- [ ] Detect Betti number changes indicating regime transitions
- [ ] Add TDA anomaly score to analysis pipeline
- [ ] Create early warning notifications via Telegram
- [ ] Add TDA dashboard section to UI
- [ ] Implement alert thresholds
- [ ] Test with live market data
- [ ] Deploy to GitHub

---

## Phase 5: Strategy Evolution (Future)
**Status**: 🔲 Not Started

### Goal
Use Optuna HPO to evolve strategy parameters based on live performance

### Tasks
- [ ] Create feedback loop: execution results → optimizer
- [ ] Implement periodic re-optimization schedule
- [ ] Add strategy performance tracking
- [ ] Create A/B testing framework for strategy variants
- [ ] Add evolution metrics to UI
- [ ] Implement automatic strategy rotation
- [ ] Deploy to GitHub

---

## Completion Log
| Phase | Date Completed | GitHub Commit |
|-------|---------------|---------------|
| Phase 1 | 2026-05-11 | Merged to main, deployed to Render — all 6 endpoints live |
| Phase 2 | 2026-05-11 | Merged to main, deployed to Vercel |
| Phase 3 | - | - |
| Phase 4 | - | - |
| Phase 5 | - | - |
```

---

## 📁 Key Files to Preserve in New Session

When you start the new chat, tell the AI about these critical files:

| File | Why It's Important |
|------|-------------------|
| `src/proxy.js` | Clerk middleware — MUST NOT be deleted |
| `.env.local` | All API keys — MUST NOT be deleted |
| `src/components/trading/TradingWorkflow.jsx` | Main trading UI |
| `src/app/api/trading/analyze/route.js` | Analysis pipeline |
| `src/app/api/trading/approve/route.js` | Trade approval |
| `src/app/api/trading/execute/route.js` | Trade execution |
| `src/app/api/trading/recommendations/route.js` | Recommendations API |
| `src/app/api/trading/schedule/execute/route.js` | Scheduled orders |
| `prisma/schema.prisma` | Database schema (trading schema) |
| `src/lib/db.js` | Prisma client |
| `EXECUTION_PLAN.md` | The execution plan above |

---
