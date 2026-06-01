import { withAuth } from "@/lib/withAuth";
import { getOrders } from "@/lib/alpaca-client";
import { getAlpacaCredentialKeys, resolveCredentialType } from "@/lib/alpaca-credentials";
import { createApiError } from "@/lib/error-messages";

/**
 * GET /api/alpaca/orders
 * Fetches order history using encrypted keys from Supabase
 * (with Clerk privateMetadata fallback for migration).
 */
export const GET = withAuth(async (request, _context, authContext) => {
  try {
    const credentialType = await resolveCredentialType(request, authContext);
    const keys = await getAlpacaCredentialKeys(credentialType, request, authContext);
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        {
          error: "Your trading account is not connected yet. Add your Alpaca API keys to get started.",
          code: "NO_KEYS",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "3m";

    const now = new Date();
    const after = new Date();
    if (period === "1m") after.setMonth(now.getMonth() - 1);
    else if (period === "3m") after.setMonth(now.getMonth() - 3);
    else if (period === "6m") after.setMonth(now.getMonth() - 6);
    else after.setFullYear(now.getFullYear() - 1);

    const orders = await getOrders(keys.apiKey, keys.secretKey, {
      status: "all",
      after: after.toISOString(),
      mode: credentialType,
    });

    return Response.json(orders);
  } catch (error) {
    return createApiError(error, { context: "orders" });
  }
}, { minRole: "viewer" });
