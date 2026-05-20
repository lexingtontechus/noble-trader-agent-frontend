import { getAuthDebugInfo, getFastAPIAuthHeaders } from "@/lib/fastapi-auth";

export async function GET() {
  const debugInfo = await getAuthDebugInfo();
  const authHeaders = await getFastAPIAuthHeaders();

  return Response.json({
    debugInfo,
    authHeaders: {
      hasAuthorization: !!authHeaders["Authorization"],
      authHeaderPreview: authHeaders["Authorization"]
        ? authHeaders["Authorization"].substring(0, 30) + "..."
        : null,
      hasApiKey: !!authHeaders["X-API-Key"],
      apiKeyPreview: authHeaders["X-API-Key"]
        ? authHeaders["X-API-Key"].substring(0, 20) + "..."
        : null,
    },
  });
}
