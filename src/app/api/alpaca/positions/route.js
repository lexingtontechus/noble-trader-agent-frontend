import { withAuth } from "@/lib/withAuth";
import { getPositions } from "@/lib/alpaca-client";
import { getAlpacaCredentialKeys, resolveCredentialType } from "@/lib/alpaca-credentials";
import { createApiError } from "@/lib/error-messages";

/**
 * GET /api/alpaca/positions
 * Fetches open positions using encrypted keys from Supabase
 * (with Clerk privateMetadata fallback for migration).
 */
export const GET = withAuth(async (request, _context, _authContext) => {
  try {
    const credentialType = await resolveCredentialType(request);
    const keys = await getAlpacaCredentialKeys(credentialType, request);
    if (!keys?.apiKey || !keys?.secretKey) {
      return Response.json(
        {
          error: "Your trading account is not connected yet. Add your Alpaca API keys to get started.",
          code: "NO_KEYS",
        },
        { status: 403 }
      );
    }

    const positions = await getPositions(keys.apiKey, keys.secretKey, credentialType);
    return Response.json(positions);
  } catch (error) {
    return createApiError(error, { context: "positions" });
  }
}, { minRole: "viewer" });
