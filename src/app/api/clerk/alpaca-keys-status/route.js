import { hasAlpacaKeys } from "@/lib/clerk-metadata";

export async function GET() {
  try {
    const configured = await hasAlpacaKeys();
    return Response.json({ configured });
  } catch (error) {
    return Response.json({ configured: false, error: error.message }, { status: 500 });
  }
}
