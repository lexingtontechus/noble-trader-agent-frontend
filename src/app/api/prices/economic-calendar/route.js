import { NextResponse } from "next/server";

/**
 * GET /api/prices/economic-calendar
 *
 * Proxies Finnhub's economic calendar API.
 * Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Finnhub free tier: 60 calls/min
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Finnhub API key not configured" }, { status: 500 });
    }

    // Default to this week if no dates provided
    const today = new Date();
    const fromDate = from || today.toISOString().split("T")[0];
    const toDate = to || new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const url = `https://finnhub.io/api/v1/calendar/economic?token=${apiKey}&from=${fromDate}&to=${toDate}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Finnhub API error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Finnhub returns { economicCalendar: [...] }
    const events = (data.economicCalendar || []).map((event) => ({
      id: `${event.time}-${event.event}-${event.country}`,
      time: event.time,
      event: event.event,
      country: event.country,
      impact: event.impact, // "low", "medium", "high"
      estimate: event.estimate,
      actual: event.actual,
      prev: event.prev,
      unit: event.unit,
    }));

    return NextResponse.json({ events, from: fromDate, to: toDate });
  } catch (err) {
    console.error("[Economic Calendar API] Error:", err.message);
    return NextResponse.json(
      { error: "Failed to fetch economic calendar" },
      { status: 500 }
    );
  }
}
