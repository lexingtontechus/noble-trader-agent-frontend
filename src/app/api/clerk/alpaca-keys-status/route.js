import { withAuth } from "@/lib/withAuth";
import { hasAlpacaKeys } from "@/lib/clerk-metadata";
import { createApiError } from "@/lib/error-messages";

export const GET = withAuth(async (request, _context, _authContext) => {
  try {
    const configured = await hasAlpacaKeys();
    return Response.json({ configured });
  } catch (error) {
    return createApiError(error, { context: "credentials" });
  }
}, { minRole: "viewer" });
