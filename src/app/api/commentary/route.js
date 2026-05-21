import ZAI from "z-ai-web-dev-sdk";
import OpenAI from "openai";
import { getCached, setCache } from "@/lib/cache";
import { withAuth } from "@/lib/withAuth";

// ── ZAI instance (lazy-initialized) ────────────────────────────────────────
let zaiInstance = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

// ── Groq fallback client (lazy-initialized) ────────────────────────────────
let groqClient = null;

function getGroq() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured.");
  }
  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return groqClient;
}

/**
 * Build the prompt for commentary generation.
 */
function buildPrompt(symbol, regime, sizing, risk) {
  return `You are a quantitative trading analyst. Based on the following market analysis for ${symbol}, provide a concise 3-4 sentence actionable commentary.

Regime: ${regime?.regime_label || "Unknown"} (confidence: ${((regime?.confidence || 0) * 100).toFixed(1)}%)
Vol State: ${regime?.vol_state || "N/A"} | Trend State: ${regime?.trend_state || "N/A"}
Risk Multiplier: ${regime?.risk_multiplier || "N/A"}
Recommended Position: ${((sizing?.recommended_f || 0) * 100).toFixed(2)}%
VaR 95%: ${((risk?.var_95 || 0) * 100).toFixed(2)}% | CVaR 95%: ${((risk?.cvar_95 || 0) * 100).toFixed(2)}%
Max Drawdown: ${((risk?.max_drawdown || 0) * 100).toFixed(2)}%
Sharpe Ratio: ${sizing?.sharpe_ratio?.toFixed(2) || "N/A"}
Stop: ${risk?.suggested_stop?.toFixed(2) || "N/A"} | TP: ${risk?.suggested_tp?.toFixed(2) || "N/A"}

Provide specific, actionable insights based on the regime state and risk metrics.`;
}

const SYSTEM_PROMPT =
  "You are a quantitative trading analyst. Provide concise, actionable market commentary in 3-4 sentences.";

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Try generating commentary using z-ai-web-dev-sdk.
 * Returns the commentary string, or throws on failure.
 */
async function generateWithZAI(prompt) {
  const zai = await getZAI();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    thinking: { type: "disabled" },
  });

  const commentary = completion?.choices?.[0]?.message?.content;
  if (!commentary || commentary.trim().length === 0) {
    throw new Error("z-ai returned empty response");
  }
  return commentary;
}

/**
 * Try generating commentary using Groq (OpenAI-compatible API).
 * Returns the commentary string, or throws on failure.
 */
async function generateWithGroq(prompt) {
  const groq = getGroq();
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    max_tokens: 300,
    temperature: 0.7,
  });

  const commentary = completion?.choices?.[0]?.message?.content;
  if (!commentary || commentary.trim().length === 0) {
    throw new Error("Groq returned empty response");
  }
  return commentary;
}

export const POST = withAuth(async (request, context, authContext) => {
  try {
    const body = await request.json();
    const { symbol, regime, sizing, risk } = body;

    if (!symbol) {
      return Response.json(
        { error: "Symbol is required for commentary generation" },
        { status: 400 },
      );
    }

    // Build cache key from symbol + regime label
    const regimeLabel = regime?.regime_label || "Unknown";
    const cacheKey = `commentary:${symbol}:${regimeLabel}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return Response.json({ commentary: cached.commentary, cached: true });
    }

    const prompt = buildPrompt(symbol, regime, sizing, risk);

    // Primary: z-ai-web-dev-sdk
    let commentary;
    let provider = "z-ai";

    try {
      commentary = await generateWithZAI(prompt);
    } catch (zaiError) {
      console.warn("z-ai commentary failed, falling back to Groq:", zaiError.message);

      // Fallback: Groq
      try {
        commentary = await generateWithGroq(prompt);
        provider = "groq";
      } catch (groqError) {
        // Both providers failed
        console.error("Groq fallback also failed:", groqError.message);

        // Return specific error for missing Groq API key
        if (groqError.message?.includes("GROQ_API_KEY")) {
          return Response.json(
            {
              error:
                "AI commentary unavailable. Both z-ai and Groq (no API key) failed. Please configure GROQ_API_KEY.",
            },
            { status: 503 },
          );
        }

        // Handle Groq rate limit
        if (groqError.status === 429) {
          return Response.json(
            { error: "Rate limit reached. Please try again in a minute." },
            { status: 429 },
          );
        }

        return Response.json(
          {
            error:
              groqError.message || "Failed to generate commentary from all providers",
          },
          { status: 500 },
        );
      }
    }

    // Cache the result for 10 minutes
    setCache(cacheKey, { commentary }, CACHE_TTL);

    return Response.json({ commentary, provider });
  } catch (error) {
    console.error("Commentary API error:", error);
    return Response.json(
      { error: error.message || "Failed to generate commentary" },
      { status: 500 },
    );
  }
}, { minRole: "viewer" });
