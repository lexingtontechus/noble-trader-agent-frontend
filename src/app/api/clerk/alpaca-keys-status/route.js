import { hasAlpacaKeys } from "@/lib/clerk-metadata";
import { createApiError } from "@/lib/error-messages";

export async function GET() {
  try {
    const configured = await hasAlpacaKeys();
    return Response.json({ configured });
  } catch (error) {
    return createApiError(error, { context: "credentials" });
  }
}
