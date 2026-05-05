import YahooFinance from "yahoo-finance2";
import { seedSession } from "@/lib/fastapi-client";

const yahooFinance = new YahooFinance({ suppressNotices: ["ripHistorical"] });

const MIN_BARS = 81; // FastAPI requires minimum 81 bars for HMM fitting

function getPeriodDates(period) {
  const now = new Date();
  const msDay = 86400000;
  let daysBack;
  switch (period) {
    case "1y":
      daysBack = 365;
      break;
    case "2y":
      daysBack = 730;
      break;
    default:
      daysBack = 180; // 6mo default
  }
  const period1 = new Date(now.getTime() - daysBack * msDay);
  return { period1, period2: now };
}

/**
 * POST /api/stream/seed
 * Seeds a FastAPI streaming session with Yahoo Finance historical prices.
 * Body: { symbol, period?, window?, kelly_fraction?, target_vol?, base_risk_limit?, refit_every? }
 *
 * Fixes:
 * - Minimum 81 bars (matches FastAPI HMM requirement)
 * - Auto-extends period if insufficient data
 * - Returns seed status with session details
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      symbol,
      period = "6mo",
      window,
      kelly_fraction,
      target_vol,
      base_risk_limit,
      refit_every,
    } = body;

    if (!symbol) {
      return Response.json({ error: "symbol required" }, { status: 400 });
    }

    // Fetch historical prices from Yahoo Finance
    const { period1, period2 } = getPeriodDates(period);
    let result = await yahooFinance.chart(symbol, { period1, period2 });

    let quotes = (result.quotes || []).filter((q) => q.close != null);
    let prices = quotes.map((q) => q.close);
    let dates = quotes.map((q) => new Date(q.date).toISOString().split("T")[0]);

    // If insufficient data, try extending to 1y then 2y
    if (prices.length < MIN_BARS && period !== "2y") {
      const extendedPeriod = period === "6mo" ? "1y" : "2y";
      console.log(
        `[Stream Seed] ${symbol}: ${prices.length} bars < ${MIN_BARS} required, extending to ${extendedPeriod}`,
      );

      const extendedDates = getPeriodDates(extendedPeriod);
      result = await yahooFinance.chart(symbol, {
        period1: extendedDates.period1,
        period2: extendedDates.period2,
      });
      quotes = (result.quotes || []).filter((q) => q.close != null);
      prices = quotes.map((q) => q.close);
      dates = quotes.map((q) => new Date(q.date).toISOString().split("T")[0]);
    }

    if (prices.length < MIN_BARS) {
      return Response.json(
        {
          error: `Insufficient price data: ${prices.length} bars (minimum ${MIN_BARS} for HMM fitting). Try a longer period or a different symbol.`,
          bars_fetched: prices.length,
          min_required: MIN_BARS,
        },
        { status: 400 },
      );
    }

    // Seed the FastAPI streaming session
    const sessionStatus = await seedSession(symbol, prices, {
      window,
      kelly_fraction,
      target_vol,
      base_risk_limit,
      refit_every,
    });

    return Response.json({
      ...sessionStatus,
      prices_fetched: prices.length,
      dates,
      prices,
    });
  } catch (error) {
    console.error("Stream seed error:", error);
    return Response.json(
      { error: `Stream seed failed: ${error.message}` },
      { status: 500 },
    );
  }
}
