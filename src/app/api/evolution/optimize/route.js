/**
 * POST /api/evolution/optimize
 * Run Optuna-style hyperparameter optimization for a symbol.
 *
 * Body: {
 *   symbol: string,
 *   nTrials?: number (default 10),
 *   studyName?: string,
 *   prices?: number[]  (if not provided, fetched from Yahoo)
 * }
 */
import { runOptunaOptimization } from "@/lib/strategy-evolution";
import { fetchHistoricalPrices } from "@/lib/yahoo-prices";
import { alpacaToYahooSymbol } from "@/lib/symbol-utils";
import { withAuth } from "@/lib/withAuth";

export const POST = withAuth(async (request, context, authContext) => {
  try {
    const body = await request.json();
    const { symbol, nTrials, studyName, prices: providedPrices } = body;

    if (!symbol) {
      return Response.json({ error: "symbol is required" }, { status: 400 });
    }

    // Fetch prices if not provided
    let prices = providedPrices;
    if (!prices || prices.length < 250) {
      try {
        const yahooSymbol = alpacaToYahooSymbol(symbol);
        const data = await fetchHistoricalPrices(yahooSymbol);
        prices = data?.prices || [];
      } catch (e) {
        return Response.json(
          { error: `Failed to fetch prices for ${symbol}: ${e.message}` },
          { status: 400 }
        );
      }
    }

    if (!prices || prices.length < 100) {
      return Response.json(
        { error: `Insufficient price data for ${symbol} (${prices?.length || 0} bars, need 100+)` },
        { status: 400 }
      );
    }

    const result = await runOptunaOptimization({
      symbol,
      prices,
      nTrials: nTrials || 10,
      studyName: studyName || `noble-${symbol}-${Date.now()}`,
    });

    return Response.json({
      symbol,
      nTrials: result.allTrials.length,
      bestVariant: result.bestVariant ? {
        id: result.bestVariant.id,
        name: result.bestVariant.name,
        composite: result.bestVariant.composite,
        params: {
          nHmmStates: result.bestVariant.nHmmStates,
          kellyFraction: result.bestVariant.kellyFraction,
          targetVol: result.bestVariant.targetVol,
          baseRiskLimit: result.bestVariant.baseRiskLimit,
          maxPositionPct: result.bestVariant.maxPositionPct,
        },
      } : null,
      allTrials: result.allTrials.map((t) => ({
        trial: t.trial,
        composite: t.composite,
        params: t.params,
        sharpe: t.backtest?.sharpe_ratio,
        winRate: t.backtest?.win_rate,
        maxDrawdown: t.backtest?.max_drawdown,
        profitFactor: t.backtest?.profit_factor,
        totalReturn: t.backtest?.total_return,
      })),
    });
  } catch (error) {
    console.error("Evolution optimize error:", error);
    return Response.json(
      { error: `Optimization failed: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "admin" });
