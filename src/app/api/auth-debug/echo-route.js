// Temporary: Test what headers getFastAPIAuthHeaders produces
import { getFastAPIAuthHeaders } from "@/lib/fastapi-auth";

export async function GET() {
  const authHeaders = await getFastAPIAuthHeaders();
  
  // Get the full Authorization header value (we need to see the actual token)
  const authToken = authHeaders["Authorization"] || "";
  const apiKey = authHeaders["X-API-Key"] || "";
  
  // Decode the JWT payload for inspection
  let tokenPayload = null;
  if (authToken.startsWith("Bearer ")) {
    try {
      const jwt = authToken.substring(7);
      const parts = jwt.split(".");
      if (parts.length === 3) {
        const payload = Buffer.from(parts[1], "base64url").toString();
        tokenPayload = JSON.parse(payload);
      }
    } catch (e) {
      tokenPayload = { error: e.message };
    }
  }
  
  return Response.json({
    authHeaderPresent: !!authToken,
    authHeaderPrefix: authToken.substring(0, 20),
    tokenPayload,
    apiKeyPresent: !!apiKey,
    apiKeyPrefix: apiKey.substring(0, 20),
  });
}
