import ZAI from "z-ai-web-dev-sdk";
import { getCached, setCache } from "@/lib/cache";

// Reusable ZAI instance (lazy-initialized)
let zaiInstance = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { symbol, regime, sizing, risk } = body;

    if (!symbol) {
      return Response.json(
        { error: "Symbol is required for commentary generation" },
        { status: 400 },
      );
    }

    // Build cache key from symbol + key metrics (avoids duplicate LLM calls)
    const regimeLabel = regime?.regime_label || "Unknown";
    const cacheKey = `commentary:${symbol}:${regimeLabel}:${((risk?.var_95 || 0) * 100).toFixed(1)}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return Response.json({ commentary: cached.commentary, cached: true });
    }

    const prompt = `You are a quantitative trading analyst. Based on the following market analysis for ${symbol}, provide a concise 3-4 sentence actionable commentary.

Regime: ${regime?.regime_label || "Unknown"} (confidence: ${((regime?.confidence || 0) * 100).toFixed(1)}%)
Vol State: ${regime?.vol_state || "N/A"} | Trend State: ${regime?.trend_state || "N/A"}
Risk Multiplier: ${regime?.risk_multiplier || "N/A"}
Recommended Position: ${((sizing?.recommended_f || 0) * 100).toFixed(2)}%
VaR 95%: ${((risk?.var_95 || 0) * 100).toFixed(2)}% | CVaR 95%: ${((risk?.cvar_95 || 0) * 100).toFixed(2)}%
Max Drawdown: ${((risk?.max_drawdown || 0) * 100).toFixed(2)}%
Sharpe Ratio: ${sizing?.sharpe_ratio?.toFixed(2) || "N/A"}
Stop: ${risk?.suggested_stop?.toFixed(2) || "N/A"} | TP: ${risk?.suggested_tp?.toFixed(2) || "N/A"}

Provide specific, actionable insights based on the regime state and risk metrics.`;

    const zai = await getZAI();

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content:
            "You are a quantitative trading analyst. Provide concise, actionable market commentary in 3-4 sentences.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      thinking: { type: "disabled" },
    });

    const commentary = completion.choices?.[0]?.message?.content;

    if (!commentary || commentary.trim().length === 0) {
      return Response.json(
        { error: "AI generated an empty response. Please try again." },
        { status: 502 },
      );
    }

    // Cache for 10 minutes
    setCache(cacheKey, { commentary }, 10 * 60 * 1000);

    return Response.json({ commentary });
  } catch (error) {
    console.error("Commentary API error:", error);

    // ZAI SDK errors
    if (error.message?.includes("ZAI") || error.message?.includes("SDK")) {
      return Response.json(
        {
          error:
            "AI service temporarily unavailable. Please try again in a moment.",
        },
        { status: 503 },
      );
    }

    return Response.json(
      { error: error.message || "Failed to generate commentary" },
      { status: 500 },
    );
  }
}
