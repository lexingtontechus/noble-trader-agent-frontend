import { withAuth } from "@/lib/withAuth";
import { getAlpacaKeys, setAlpacaKeys, deleteAlpacaKeys } from "@/lib/clerk-metadata";
import { createApiError } from "@/lib/error-messages";

// GET — returns ONLY whether keys are configured (never exposes the actual values)
export const GET = withAuth(async (request, _context, _authContext) => {
  try {
    const keys = await getAlpacaKeys();
    const configured = !!(keys?.apiKey && keys?.secretKey);
    return Response.json({ configured });
  } catch (error) {
    return createApiError(error, { context: "credentials" });
  }
}, { minRole: "viewer" });

// POST — save new Alpaca keys
export const POST = withAuth(async (request, _context, _authContext) => {
  try {
    const body = await request.json();
    const { apiKey, secretKey } = body;

    if (!apiKey || !secretKey) {
      return Response.json({ error: "Both API Key and Secret Key are required" }, { status: 400 });
    }

    await setAlpacaKeys(apiKey, secretKey);
    return Response.json({ success: true, message: "Alpaca keys saved successfully" });
  } catch (error) {
    return createApiError(error, { context: "credentials" });
  }
}, { minRole: "viewer" });

// DELETE — remove Alpaca keys
export const DELETE = withAuth(async (request, _context, _authContext) => {
  try {
    await deleteAlpacaKeys();
    return Response.json({ success: true, message: "Alpaca keys removed" });
  } catch (error) {
    return createApiError(error, { context: "credentials" });
  }
}, { minRole: "viewer" });
