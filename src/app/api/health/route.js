export async function GET() {
  const FASTAPI_BASE =
    process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
    "https://noble-trader-fastapi-backend.onrender.com";
  const start = Date.now();
  try {
    const res = await fetch(`${FASTAPI_BASE}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - start;
    const data = await res.json().catch(() => ({}));

    // Backend returns { status: "ok" } when healthy
    const healthy =
      res.ok && (data?.status === "ok" || data?.status === "online");

    return Response.json({
      status: healthy ? "ok" : "degraded",
      healthy,
      latency_ms: latency,
    });
  } catch {
    const latency = Date.now() - start;
    return Response.json({
      status: "offline",
      healthy: false,
      latency_ms: latency,
    });
  }
}
