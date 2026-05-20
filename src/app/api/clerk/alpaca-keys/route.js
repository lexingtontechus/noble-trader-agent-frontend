import { getAlpacaKeys, setAlpacaKeys, deleteAlpacaKeys } from "@/lib/clerk-metadata";
import { createApiError } from "@/lib/error-messages";

// GET — returns ONLY whether keys are configured (never exposes the actual values)
export async function GET() {
  try {
    const keys = await getAlpacaKeys();
    const configured = !!(keys?.apiKey && keys?.secretKey);
    return Response.json({ configured });
  } catch (error) {
    return createApiError(error, { context: "credentials" });
  }
}

// POST — save new Alpaca keys
export async function POST(request) {
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
}

// DELETE — remove Alpaca keys
export async function DELETE() {
  try {
    await deleteAlpacaKeys();
    return Response.json({ success: true, message: "Alpaca keys removed" });
  } catch (error) {
    return createApiError(error, { context: "credentials" });
  }
}
