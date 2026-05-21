import { NextResponse } from "next/server";
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";
import { withAuth } from "@/lib/withAuth";

const FASTAPI_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
  "https://noble-trader-fastapi-backend.onrender.com";

export const GET = withAuth(async (request, context, authContext) => {
  try {
    const authHeaders = await getFastAPIAuthHeaders();

    const res = await fetch(`${FASTAPI_BASE}/stream/sessions`, {
      headers: {
        ...authHeaders,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`FastAPI sessions failed: ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}, { minRole: "viewer" });
