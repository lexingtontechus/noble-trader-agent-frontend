/**
 * GET /api/prices/search
 *
 * BFF proxy for Yahoo Finance autocomplete.
 * Avoids CORS issues when calling Yahoo Finance directly from the browser.
 *
 * Query params:
 *   - q (required): Search query string (min 1 char)
 *
 * Features:
 *   - Proxies to Yahoo Finance /v1/finance/search
 *   - Filters results to EQUITY, CRYPTO, ETF, FUTURE types
 *   - In-memory cache with 5-minute TTL (search results don't change fast)
 *   - AbortSignal.timeout(8000) for Vercel hobby plan safety
 *   - withAuth with minRole: "viewer" and rateTier: "data"
 *
 * Rate limiting: auto-detected "data" tier via withAuth
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";

// ── In-memory cache for search results (5-minute TTL) ──────────────────────
const searchCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const ALLOWED_QUOTE_TYPES = new Set(["EQUITY", "CRYPTO", "ETF", "FUTURE"]);

export const GET = withAuth(async (request, context, authContext) => {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 },
    );
  }

  const trimmedQuery = query.trim();

  // Check cache
  const cacheKey = `search:${trimmedQuery.toLowerCase()}`;
  const cachedEntry = searchCache.get(cacheKey);
  if (cachedEntry && Date.now() < cachedEntry.expiry) {
    return NextResponse.json(cachedEntry.data);
  }

  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(trimmedQuery)}&quotesCount=8&newsCount=0`;

    const res = await fetch(yahooUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`Yahoo Finance search failed: ${res.status}`);
    }

    const data = await res.json();

    // Filter to allowed quote types
    const quotes = (data.quotes || [])
      .filter((q) => ALLOWED_QUOTE_TYPES.has(q.quoteType))
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        type: q.quoteType,
      }));

    const responseData = { quotes };

    // Cache the result
    searchCache.set(cacheKey, { data: responseData, expiry: Date.now() + CACHE_TTL_MS });

    // Periodically clean expired entries (keep cache size reasonable)
    if (searchCache.size > 200) {
      const now = Date.now();
      for (const [key, entry] of searchCache) {
        if (now > entry.expiry) searchCache.delete(key);
      }
    }

    return NextResponse.json(responseData);
  } catch (err) {
    // Return cached data on error if available (even if expired)
    if (cachedEntry) {
      return NextResponse.json(cachedEntry.data);
    }
    return NextResponse.json(
      { error: `Search failed: ${err.message}` },
      { status: 500 },
    );
  }
}, { minRole: "viewer", rateTier: "data" });
