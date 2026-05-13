/**
 * Supabase browser client for client-side usage.
 * Uses @supabase/ssr for Next.js App Router compatibility.
 *
 * This file is for CLIENT COMPONENTS only.
 * For server-side usage (API routes, Server Actions, Middleware),
 * use @/lib/supabase/server instead.
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
  );
}
