/**
 * POST /api/auth/clerk-verify
 * Uses Clerk auth to get a JWT, then sends it to FastAPI POST /auth/clerk/verify
 * Lightweight — no verifyToken() to avoid heavy JWKS download.
 */

import { withAuth } from "@/lib/withAuth";
import { auth } from '@clerk/nextjs/server'

const FASTAPI_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
  'https://noble-trader-fastapi-backend.onrender.com'

async function getClerkJWT(sessionId) {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY
  if (!clerkSecretKey) return null

  const headers = {
    Authorization: `Bearer ${clerkSecretKey}`,
    'Content-Type': 'application/json',
  }

  // Try "server" template first (includes email, name, role claims)
  try {
    const templateRes = await fetch(
      `https://api.clerk.com/v1/sessions/${sessionId}/tokens`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ template: 'server' }),
        signal: AbortSignal.timeout(10000),
      }
    )
    if (templateRes.ok) {
      const td = await templateRes.json()
      if (td.jwt) return td.jwt
    }
  } catch { /* template may not exist */ }

  // Fallback: default JWT
  try {
    const tokenRes = await fetch(
      `https://api.clerk.com/v1/sessions/${sessionId}/tokens`,
      {
        method: 'POST',
        headers,
        body: '{}',
        signal: AbortSignal.timeout(10000),
      }
    )
    if (tokenRes.ok) {
      const td = await tokenRes.json()
      if (td.jwt) return td.jwt
    }
  } catch { /* failed */ }

  return null
}

export const POST = withAuth(async (request, _context, _authContext) => {
  try {
    const { userId, sessionId } = await auth()

    if (!userId || !sessionId) {
      return Response.json(
        { error: 'Not signed in via Clerk' },
        { status: 401 }
      )
    }

    // Get Clerk JWT
    const jwt = await getClerkJWT(sessionId)
    if (!jwt) {
      return Response.json(
        { error: 'Could not obtain Clerk JWT token' },
        { status: 500 }
      )
    }

    // Send JWT to FastAPI /auth/clerk/verify
    const res = await fetch(`${FASTAPI_BASE}/auth/clerk/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: jwt }),
      signal: AbortSignal.timeout(30000),
    })

    const data = await res.json()

    if (!res.ok) {
      return Response.json(
        {
          error: 'FastAPI clerk-verify request failed',
          status: res.status,
          detail: data,
        },
        { status: res.status }
      )
    }

    return Response.json(data)
  } catch (err) {
    console.error('[/api/auth/clerk-verify] Error:', err.message)

    if (err.name === 'TimeoutError') {
      return Response.json(
        {
          error: 'FastAPI backend timed out (cold start possible)',
          detail: err.message,
        },
        { status: 504 }
      )
    }

    return Response.json(
      { error: 'Clerk-verify proxy failed', detail: err.message },
      { status: 502 }
    )
  }
}, { minRole: "viewer" });
