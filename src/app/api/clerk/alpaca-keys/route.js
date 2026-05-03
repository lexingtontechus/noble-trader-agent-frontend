import {
  getAlpacaKeys,
  setAlpacaKeys,
  deleteAlpacaKeys,
} from "@/lib/clerk-metadata";

// GET — returns ONLY whether keys are configured (never exposes the actual values)
export async function GET() {
  try {
    const keys = await getAlpacaKeys();
    const configured = !!(keys?.apiKey && keys?.secretKey);
    return Response.json({ configured });
  } catch (error) {
    return Response.json(
      { configured: false, error: error.message },
      { status: 500 },
    );
  }
}

// POST — save new Alpaca keys
export async function POST(request) {
  try {
    const body = await request.json();
    const { apiKey, secretKey } = body;

    if (!apiKey || !secretKey) {
      return Response.json(
        { error: "Both apiKey and secretKey are required" },
        { status: 400 },
      );
    }

    await setAlpacaKeys(apiKey, secretKey);
    return Response.json({
      success: true,
      message: "Alpaca keys saved to private metadata",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — remove Alpaca keys
export async function DELETE() {
  try {
    await deleteAlpacaKeys();
    return Response.json({
      success: true,
      message: "Alpaca keys removed from private metadata",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
