/**
 * GET /api/auth/clerk-config
 * Proxies to FastAPI GET /auth/clerk/config
 * Returns Clerk configuration from the backend (no auth required)
 */

const FASTAPI_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
  'https://noble-trader-fastapi-backend.onrender.com'

export async function GET() {
  try {
    const res = await fetch(`${FASTAPI_BASE}/auth/clerk/config`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
    })

    const data = await res.json()

    if (!res.ok) {
      return Response.json(
        {
          error: 'FastAPI clerk-config request failed',
          status: res.status,
          detail: data,
        },
        { status: res.status }
      )
    }

    return Response.json(data)
  } catch (err) {
    console.error('[/api/auth/clerk-config] Error:', err.message)

    if (err.name === 'TimeoutError') {
      return Response.json(
        { error: 'FastAPI backend timed out (cold start possible)', detail: err.message },
        { status: 504 }
      )
    }

    return Response.json(
      { error: 'Failed to fetch Clerk config from backend', detail: err.message },
      { status: 502 }
    )
  }
}
