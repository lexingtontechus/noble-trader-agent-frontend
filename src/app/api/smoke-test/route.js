/**
 * API Route: /api/smoke-test
 *
 * POST — Run the full paper trading E2E smoke test (admin+ only)
 * GET  — Get the last smoke test result and history (viewer+)
 *
 * Uses withAuth() middleware for auth and RBAC.
 */

import { withAuth } from "@/lib/withAuth";
import { runSmokeTest, getLastSmokeTest, getSmokeTestHistory } from "@/lib/smoke-test";
import { getAlpacaCredentialKeys } from "@/lib/alpaca-credentials";

// ── POST: Run the smoke test ──────────────────────────────────────────────────

export const POST = withAuth(async (request, _context, authContext) => {
  try {
    const { userId } = authContext;

    // Resolve Alpaca keys (paper only)
    const keys = await getAlpacaCredentialKeys("paper", request, authContext);
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        {
          error: "Alpaca paper trading keys are required to run the smoke test. Please add your API keys in Settings.",
          code: "NO_KEYS",
        },
        { status: 403 }
      );
    }

    const result = await runSmokeTest({
      userId,
      alpacaKeys: { apiKey: keys.apiKey, secretKey: keys.secretKey },
      mode: "paper",
    });

    return Response.json(result);
  } catch (error) {
    console.error("[smoke-test] POST error:", error.message);
    return Response.json(
      { error: `Smoke test failed: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "admin", rateLimit: { max: 3, windowMs: 300000 } }); // 3 runs per 5 min

// ── GET: Get last result + history ────────────────────────────────────────────

export const GET = withAuth(async (request, _context, authContext) => {
  try {
    const { userId } = authContext;
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get("history") === "true";
    const historyLimit = parseInt(searchParams.get("limit") || "10");

    const [lastResult, history] = await Promise.all([
      getLastSmokeTest({ userId }),
      includeHistory ? getSmokeTestHistory({ userId, limit: historyLimit }) : Promise.resolve(null),
    ]);

    return Response.json({
      lastResult,
      history: history || undefined,
    });
  } catch (error) {
    console.error("[smoke-test] GET error:", error.message);
    return Response.json(
      { error: `Failed to fetch smoke test results: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });
