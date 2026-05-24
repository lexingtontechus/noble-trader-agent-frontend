/**
 * Supabase service-role client — bypasses RLS for admin operations.
 *
 * Use ONLY in server-side API routes that require elevated DB access
 * (e.g. admin config mutations, audit log writes).
 *
 * ENV VARS REQUIRED:
 *   NEXT_PUBLIC_SUPABASE_URL — e.g. https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _serviceClient = null;

export function getServiceRoleClient() {
  if (_serviceClient) return _serviceClient;
  if (!SUPABASE_URL) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL env var");
  }
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  }
  _serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _serviceClient;
}

export default getServiceRoleClient;
