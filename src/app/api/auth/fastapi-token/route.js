import { NextResponse } from 'next/server'
import { withAuth } from "@/lib/withAuth";

const FASTAPI_BASE = process.env.NEXT_PUBLIC_FASTAPI_BASE_URL || 'https://noble-trader-fastapi-backend.onrender.com'
const FASTAPI_USER = process.env.FASTAPI_USER || ''
const FASTAPI_PASSWORD = process.env.FASTAPI_PASSWORD || ''

/**
 * POST /api/auth/fastapi-token
 * Get a JWT token from the FastAPI backend for authenticated endpoints.
 *
 * Tries OAuth2 password flow first, falls back to API key exchange.
 */
export const POST = withAuth(async (request, context, authContext) => {
  try {
    // Strategy 1: Try OAuth2 password flow (POST /auth/token)
    try {
      const formData = new URLSearchParams()
      formData.append('username', FASTAPI_USER)
      formData.append('password', FASTAPI_PASSWORD)

      const tokenRes = await fetch(`${FASTAPI_BASE}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
        signal: AbortSignal.timeout(10000),
      })

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json()
        return NextResponse.json({
          access_token: tokenData.access_token,
          token_type: tokenData.token_type || 'bearer',
          expires_in: tokenData.expires_in,
          sub: tokenData.sub,
          role: tokenData.role,
          method: 'oauth2',
        })
      }
    } catch {
      // /auth/token not available — fall through
    }

    // Strategy 2: Try using credentials as API key directly
    // The FastAPI backend checks X-API-Key against API_KEYS env var
    const testRes = await fetch(`${FASTAPI_BASE}/portfolio/symbols`, {
      headers: { 'X-API-Key': FASTAPI_PASSWORD },
      signal: AbortSignal.timeout(10000),
    })

    if (testRes.ok) {
      // API key works — return it for the client to use
      return NextResponse.json({
        access_token: FASTAPI_PASSWORD,
        token_type: 'api_key',
        expires_in: 0, // API keys don't expire
        sub: FASTAPI_USER,
        role: 'trader',
        method: 'api_key',
      })
    }

    // Strategy 3: No auth method works — return error with details
    return NextResponse.json({
      error: 'Could not authenticate with FastAPI backend',
      detail: 'Neither OAuth2 token endpoint nor API key authentication succeeded. Ensure AUTH_USERS or API_KEYS is configured on the backend.',
      hint: 'Set AUTH_ENABLED=false on the backend to disable auth for development.',
    }, { status: 503 })
  } catch (err) {
    console.error('[/api/auth/fastapi-token] Error:', err.message)
    return NextResponse.json(
      { error: err.message || 'Auth proxy failed' },
      { status: 502 }
    )
  }
}, { minRole: "trader" });
