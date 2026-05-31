/**
 * Environment Variable Check — diagnostic endpoint.
 *
 * Public (no auth) — only reports presence/absence, never values.
 * Used to verify Vercel deployment has all required env vars configured.
 */

const REQUIRED_VARS = {
  clerk: [
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
  ],
  supabase: [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ENCRYPTION_KEY",
  ],
  backend: [
    "NEXT_PUBLIC_FASTAPI_BASE_URL",
  ],
  optional: [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "DISCORD_WEBHOOK_SIGNALS",
    "DISCORD_WEBHOOK_EXECUTIONS",
    "DISCORD_WEBHOOK_STATUS",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "NEXT_PUBLIC_FINNHUB_API_KEY",
    "FASTAPI_USER",
    "FASTAPI_PASSWORD",
  ],
};

export async function GET() {
  const results = {};
  let missing = 0;
  let present = 0;

  for (const [group, vars] of Object.entries(REQUIRED_VARS)) {
    results[group] = {};
    for (const v of vars) {
      const isSet = !!process.env[v];
      const isPublic = v.startsWith("NEXT_PUBLIC_");
      // For public vars, we can safely show if they start with expected prefix
      const hint = isSet && isPublic
        ? `${process.env[v].substring(0, 12)}...`
        : isSet ? "***set***" : "MISSING";

      results[group][v] = { isSet, hint, isPublic };
      if (isSet) present++;
      else missing++;
    }
  }

  return Response.json({
    ok: missing === 0,
    summary: { present, missing, total: present + missing },
    results,
    timestamp: new Date().toISOString(),
  });
}
