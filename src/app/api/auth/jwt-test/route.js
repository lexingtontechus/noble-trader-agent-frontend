import { withAuth } from "@/lib/withAuth";
import { auth } from "@clerk/nextjs/server";
import { getClerkJWT } from "@/lib/fastapi-auth";

/**
 * GET /api/auth/jwt-test
 *
 * End-to-end JWT integration test. Tests the full Clerk → BFF → FastAPI chain.
 * Requires an authenticated Clerk session (browser must be signed in).
 *
 * Tests:
 *   1. Clerk auth context (userId, sessionId available?)
 *   2. Clerk REST API JWT (getClerkJWT via CLERK_SECRET_KEY)
 *   3. Clerk SDK JWT (auth().getToken())
 *   4. FastAPI /auth/clerk/verify (does the backend accept our JWT?)
 *   5. FastAPI /auth/clerk/me (can we access authenticated endpoints?)
 *
 * Response: { steps: [...], success: boolean, summary: string }
 */
const FASTAPI_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ||
  "https://noble-trader-fastapi-backend.onrender.com";

export const GET = withAuth(async (request, _context, _authContext) => {
  const steps = [];
  let jwt = null;

  // ── Step 1: Clerk auth context ────────────────────────────────────────────
  try {
    const authResult = await auth();
    const step1 = {
      name: "Clerk Auth Context",
      passed: !!authResult?.userId,
      details: {
        userId: authResult?.userId || null,
        sessionId: authResult?.sessionId || null,
        hasGetToken: !!authResult?.getToken,
      },
    };
    steps.push(step1);

    if (!authResult?.userId) {
      return Response.json({
        steps,
        success: false,
        summary: "No Clerk session — please sign in first",
      });
    }
  } catch (e) {
    steps.push({ name: "Clerk Auth Context", passed: false, error: e.message });
    return Response.json({ steps, success: false, summary: "Clerk auth() failed" });
  }

  // ── Step 2: Clerk REST API JWT ────────────────────────────────────────────
  try {
    const authResult = await auth();
    const sessionId = authResult?.sessionId;

    if (sessionId) {
      jwt = await getClerkJWT(sessionId);
      steps.push({
        name: "Clerk REST API JWT",
        passed: !!jwt,
        details: {
          sessionId,
          jwtPreview: jwt ? jwt.substring(0, 50) + "..." : null,
          jwtLength: jwt?.length || 0,
        },
      });
    } else {
      steps.push({
        name: "Clerk REST API JWT",
        passed: false,
        details: { reason: "No sessionId available" },
      });
    }
  } catch (e) {
    steps.push({ name: "Clerk REST API JWT", passed: false, error: e.message });
  }

  // ── Step 3: Clerk SDK JWT (auth().getToken()) ─────────────────────────────
  try {
    const authResult = await auth();
    let sdkToken = null;

    if (authResult?.getToken) {
      sdkToken = await authResult.getToken();

      // Try server template if default fails
      if (!sdkToken) {
        try {
          sdkToken = await authResult.getToken({ template: "server" });
        } catch {
          // Template may not exist
        }
      }
    }

    // Decode payload for both tokens
    let sdkPayload = null;
    let restPayload = null;

    if (sdkToken) {
      try {
        const parts = sdkToken.split(".");
        sdkPayload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      } catch {}
    }
    if (jwt) {
      try {
        const parts = jwt.split(".");
        restPayload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      } catch {}
    }

    steps.push({
      name: "Clerk SDK JWT (getToken)",
      passed: !!sdkToken,
      details: {
        sdkTokenAvailable: !!sdkToken,
        sdkTokenLength: sdkToken?.length || 0,
        sdkIssuer: sdkPayload?.iss || null,
        sdkSubject: sdkPayload?.sub || null,
        restIssuer: restPayload?.iss || null,
        restSubject: restPayload?.sub || null,
        issuersMatch: sdkPayload?.iss === restPayload?.iss,
        subjectsMatch: sdkPayload?.sub === restPayload?.sub,
      },
    });
  } catch (e) {
    steps.push({ name: "Clerk SDK JWT (getToken)", passed: false, error: e.message });
  }

  // ── Step 4: FastAPI /auth/clerk/verify ────────────────────────────────────
  if (jwt) {
    try {
      const verifyRes = await fetch(`${FASTAPI_BASE}/auth/clerk/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: jwt }),
        signal: AbortSignal.timeout(30000),
      });

      const verifyData = await verifyRes.json();
      steps.push({
        name: "FastAPI /auth/clerk/verify",
        passed: verifyData.valid === true,
        details: {
          valid: verifyData.valid,
          user: verifyData.user || null,
          error: verifyData.error || null,
          httpStatus: verifyRes.status,
        },
      });
    } catch (e) {
      steps.push({
        name: "FastAPI /auth/clerk/verify",
        passed: false,
        error: e.message,
      });
    }
  } else {
    steps.push({
      name: "FastAPI /auth/clerk/verify",
      passed: false,
      details: { reason: "No JWT available from Step 2" },
    });
  }

  // ── Step 5: FastAPI /auth/clerk/me ────────────────────────────────────────
  if (jwt) {
    try {
      const meRes = await fetch(`${FASTAPI_BASE}/auth/clerk/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30000),
      });

      const meData = await meRes.json();
      steps.push({
        name: "FastAPI /auth/clerk/me",
        passed: meRes.ok && !!meData.sub,
        details: {
          sub: meData.sub || null,
          role: meData.role || null,
          email: meData.email || null,
          httpStatus: meRes.status,
        },
      });
    } catch (e) {
      steps.push({
        name: "FastAPI /auth/clerk/me",
        passed: false,
        error: e.message,
      });
    }
  } else {
    steps.push({
      name: "FastAPI /auth/clerk/me",
      passed: false,
      details: { reason: "No JWT available from Step 2" },
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passedCount = steps.filter((s) => s.passed).length;
  const allPassed = steps.every((s) => s.passed);

  return Response.json({
    steps,
    success: allPassed,
    summary: `${passedCount}/${steps.length} steps passed — ${
      allPassed
        ? "JWT chain is working end-to-end!"
        : "Some steps failed — check details above"
    }`,
  });
}, { minRole: "viewer" });
