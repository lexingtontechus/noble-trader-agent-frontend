import { NextResponse } from "next/server";
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";

const FASTAPI_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
  "https://noble-trader-fastapi-backend.onrender.com";

export async function POST(request) {
  try {
    const { symbol, price } = await request.json();
    if (!symbol || price == null)
      return NextResponse.json(
        { error: "Symbol and price required" },
        { status: 400 },
      );

    const authHeaders = await getFastAPIAuthHeaders();

    const res = await fetch(`${FASTAPI_BASE}/stream/tick`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ symbol, price }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `FastAPI tick failed: ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
