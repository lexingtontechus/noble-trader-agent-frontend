import { NextResponse } from "next/server";
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";

const FASTAPI_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
  "https://noble-trader-fastapi-backend.onrender.com";

export async function POST(request) {
  try {
    const body = await request.json();
    const { symbol, prices, horizon, n_paths, seed, current_price } = body;

    if (!symbol || !prices || prices.length < 20) {
      return NextResponse.json(
        { error: "Symbol and sufficient price data required (min 20 bars)" },
        { status: 400 },
      );
    }

    const authHeaders = await getFastAPIAuthHeaders();

    const res = await fetch(
      `${FASTAPI_BASE}/simulate/${encodeURIComponent(symbol)}`,
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prices,
          horizon: horizon || 63,
          n_paths: n_paths || 500,
          seed: seed ?? 42,
          current_price: current_price || prices[prices.length - 1],
        }),
        signal: AbortSignal.timeout(120000), // 2 min for simulation
      },
    );

    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ detail: `FastAPI error: ${res.status}` }));
      throw new Error(err.detail || err.error || `FastAPI ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
