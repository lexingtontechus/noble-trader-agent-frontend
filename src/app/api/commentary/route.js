import OpenAI from "openai";

// OpenRouter — OpenAI-compatible API, no location restrictions
// Get your key at: https://openrouter.ai/keys
// Strategy: try free models first, auto-fallback to cheap paid if rate-limited
// For Vercel: add OPENROUTER_API_KEY in Project Settings > Environment Variables
let client = null;

function getClient() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured. Add it to your .env.local or Vercel environment variables.",
    );
  }
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://noble-trader.vercel.app",
        "X-Title": "Noble Trader",
      },
    });
  }
  return client;
}

// Model tiers: free first, then cheap paid fallbacks
const MODEL_TIERS = [
  "meta-llama/llama-3.3-70b-instruct:free", // Free — Llama 3.3 70B
  "google/gemma-3-27b-it:free", // Free — Gemma 3 27B
  "meta-llama/llama-3.1-8b-instruct", // Paid — $0.05/M input, $0.08/M output (dirt cheap)
];

async function tryGenerate(api, prompt) {
  let lastError = null;

  for (const model of MODEL_TIERS) {
    try {
      const completion = await api.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a quantitative trading analyst. Provide concise, actionable market commentary in 3-4 sentences.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 300,
        temperature: 0.7,
      });

      const commentary = completion.choices?.[0]?.message?.content;
      if (commentary) {
        return { commentary, model };
      }
    } catch (err) {
      lastError = err;
      // If rate-limited on this model, try the next tier
      if (err.status === 429) {
        console.warn(`Model ${model} rate-limited, falling back...`);
        continue;
      }
      // For other errors, also try next model
      console.warn(`Model ${model} failed:`, err.message);
      continue;
    }
  }

  throw lastError || new Error("All model tiers failed");
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { symbol, regime, sizing, risk } = body;

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

    const api = getClient();
    const { commentary } = await tryGenerate(api, prompt);

    return Response.json({ commentary });
  } catch (error) {
    console.error("Commentary API error:", error);

    if (error.message?.includes("OPENROUTER_API_KEY")) {
      return Response.json(
        {
          error:
            "OpenRouter API key not configured. Please set OPENROUTER_API_KEY in your environment variables.",
        },
        { status: 503 },
      );
    }

    if (error.status === 429) {
      return Response.json(
        { error: "All models rate-limited. Please try again in a moment." },
        { status: 429 },
      );
    }

    return Response.json(
      { error: error.message || "Failed to generate commentary" },
      { status: 500 },
    );
  }
}
