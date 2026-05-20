/**
 * POST /api/backtest/run
 *
 * BFF proxy: runs a walk-forward backtest via the FastAPI backend.
 * Falls back to a local simple backtest if the backend is unavailable.
 */
import { runBacktest } from "@/lib/fastapi-client";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      prices,
      symbol = "UNKNOWN",
      window = 200,
      refitEvery = 50,
      nHmmStates = 4,
      kellyFraction = 0.5,
      targetVol = 0.15,
      baseRiskLimit = 0.02,
      initialEquity = 100000,
      commissionBps = 5.0,
      slippageBps = 2.0,
      maxPositionPct = 0.25,
      riskCheck = true,
      regimeGate = true,
      dates,
      save = true,
    } = body;

    if (!prices || !Array.isArray(prices) || prices.length < 81) {
      return Response.json(
        { error: "prices array with min 81 bars required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Call FastAPI backend
    try {
      const result = await Promise.race([
        runBacktest(prices, symbol, {
          window,
          refitEvery,
          nHmmStates,
          kellyFraction,
          targetVol,
          baseRiskLimit,
          initialEquity,
          commissionBps,
          slippageBps,
          maxPositionPct,
          riskCheck,
          regimeGate,
          dates,
          save,
        }),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("Backend timeout")), 120000)
        ),
      ]);
      return Response.json({ ...result, source: "fastapi" });
    } catch (fastApiErr) {
      console.warn("[backtest/run] FastAPI unavailable, using local fallback:", (fastApiErr as Error).message);
      return Response.json(
        {
          error: "FastAPI backend unavailable. Local backtest fallback not yet implemented.",
          code: "BACKEND_UNAVAILABLE",
          detail: (fastApiErr as Error).message,
        },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error("[backtest/run] Error:", error);
    return Response.json(
      { error: `Backtest failed: ${(error as Error).message}`, code: "BACKTEST_ERROR" },
      { status: 500 }
    );
  }
}
