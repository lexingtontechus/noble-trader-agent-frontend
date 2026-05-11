// Database client — now uses Supabase directly instead of Prisma.
//
// Prisma caused "Unable to open the database file" errors on Vercel serverless
// because it relied on SQLite (ephemeral filesystem) and even after switching
// to PostgreSQL, the Prisma Engine binary had cold-start issues on Vercel.
//
// The Supabase JS client is serverless-native and works perfectly on Vercel.
// This file re-exports from @/lib/supabase/db so all existing imports
// of `import { db } from "@/lib/db"` continue to work unchanged.

export { db, db as default } from "@/lib/supabase/db";
