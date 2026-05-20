/**
 * POST /api/backtest/optimize
 *
 * BFF proxy: runs a parameter sweep (grid search) via the FastAPI backend.
 * Accepts a param_grid and runs backtests across all combinations.
 */
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";

const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prices, symbol, param_grid, ...options } = body;

    if (!prices || !Array.isArray(prices) || prices.length < 81) {
      return Response.json(
        { error: "prices array with min 81 bars required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (!param_grid || typeof param_grid !== "object" || Object.keys(param_grid).length === 0) {
      return Response.json(
        { error: "param_grid object with at least one parameter required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Estimate combinations and warn if too many
    const comboCount = Object.values(param_grid).reduce(
      (acc: number, vals: unknown) => acc * (Array.isArray(vals) ? vals.length : 1),
      1
    );
    if (comboCount > 50) {
      return Response.json(
        { error: `Too many combinations (${comboCount}). Max 50 to avoid timeout.`, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const payload = {
      prices,
      symbol: symbol || "UNKNOWN",
      param_grid,
      window: options.window ?? 200,
      refit_every: options.refit_every ?? 50,
      n_hmm_states: options.n_hmm_states ?? 4,
      kelly_fraction: options.kelly_fraction ?? 0.5,
      target_vol: options.target_vol ?? 0.15,
      base_risk_limit: options.base_risk_limit ?? 0.02,
      initial_equity: options.initial_equity ?? 100000,
      commission_bps: options.commission_bps ?? 5.0,
      slippage_bps: options.slippage_bps ?? 2.0,
      max_position_pct: options.max_position_pct ?? 0.25,
      risk_check: options.risk_check ?? true,
      regime_gate: options.regime_gate ?? true,
      save: options.save ?? false,
    };

    const authHeaders = await getFastAPIAuthHeaders();

    const resp = await fetch(`${FASTAPI_URL}/backtest/optimize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(300000), // 5 min for parameter sweeps
    });

    if (!resp.ok) {
      const text = await resp.text();
      return Response.json(
        { error: `FastAPI returned ${resp.status}`, detail: text.slice(0, 500) },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    return Response.json(data);
  } catch (error) {
    console.error("[backtest/optimize] Error:", error);
    return Response.json(
      { error: `Optimize failed: ${(error as Error).message}`, code: "OPTIMIZE_ERROR" },
      { status: 500 }
    );
  }
}
