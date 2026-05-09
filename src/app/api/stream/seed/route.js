import { NextResponse } from "next/server";
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { getCached, setCache } from "@/lib/cache";
import { FASTAPI_BASE, CACHE_TTL } from "@/lib/config";

export async function POST(request) {
  try {
    const { symbol } = await request.json();
    if (!symbol)
      return NextResponse.json({ error: "Symbol required" }, { status: 400 });

    // Check cache first
    const cacheKey = `seed:${symbol}`;
    const cached = getCached(cacheKey);
    if (cached) return NextResponse.json(cached);

    // Fetch Yahoo prices first
    const priceRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
      },
    );
    if (!priceRes.ok) throw new Error(`Yahoo fetch failed: ${priceRes.status}`);
    const priceData = await priceRes.json();

    const result = priceData.chart?.result?.[0];
    if (!result) throw new Error("No price data returned");

    const quotes = result.indicators?.quote?.[0];
    const closes = quotes?.close || [];

    const prices = [];
    for (let i = 0; i < closes.length; i++) {
      if (closes[i] != null) prices.push(closes[i]);
    }

    if (prices.length < 20) throw new Error("Insufficient price data");

    // Seed FastAPI session with auth
    const authHeaders = await getFastAPIAuthHeaders();

    const seedRes = await fetch(`${FASTAPI_BASE}/stream/seed`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ symbol, prices }),
      signal: AbortSignal.timeout(60000),
    });

    if (!seedRes.ok) {
      const err = await seedRes.json().catch(() => ({}));
      throw new Error(err.detail || `FastAPI seed failed: ${seedRes.status}`);
    }

    const seedData = await seedRes.json();
    setCache(cacheKey, seedData, CACHE_TTL.SEED);
    return NextResponse.json(seedData);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
