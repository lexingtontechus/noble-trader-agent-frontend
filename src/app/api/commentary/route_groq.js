import OpenAI from "openai";

// Groq — free tier, OpenAI-compatible API, no location restrictions
// Free tier: 30 requests/min, 14,400 requests/day
// Get your free key at: https://console.groq.com/keys
// For Vercel: add GROQ_API_KEY in Project Settings > Environment Variables
let groqClient = null;

function getGroq() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not configured. Add it to your .env.local or Vercel environment variables.",
    );
  }
  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return groqClient;
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

    const groq = getGroq();
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
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

    const commentary =
      completion.choices?.[0]?.message?.content || "Analysis unavailable.";
    return Response.json({ commentary });
  } catch (error) {
    console.error("Commentary API error:", error);

    // Specific error for missing API key
    if (error.message?.includes("GROQ_API_KEY")) {
      return Response.json(
        {
          error:
            "Groq API key not configured. Please set GROQ_API_KEY in your environment variables.",
        },
        { status: 503 },
      );
    }

    // Handle rate limit errors
    if (error.status === 429) {
      return Response.json(
        { error: "Groq rate limit reached. Please try again in a minute." },
        { status: 429 },
      );
    }

    return Response.json(
      { error: error.message || "Failed to generate commentary" },
      { status: 500 },
    );
  }
}
