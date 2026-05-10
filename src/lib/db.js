// Resilient Prisma client — safe for both local dev (SQLite) and Vercel (no persistent FS).
// On Vercel, SQLite won't persist across serverless invocations, so we gracefully degrade
// by exporting a safe no-op proxy when Prisma initialization fails.

import { PrismaClient } from "@prisma/client";

function createNoOpDB() {
  // A Proxy-based no-op that returns empty results for any model access.
  // This prevents crashes when Prisma can't connect (e.g. on Vercel with SQLite).
  const handler = {
    get(_target, prop) {
      if (typeof prop === "symbol" || prop.startsWith("_")) return undefined;
      return new Proxy(
        {},
        {
          get(_t, method) {
            if (
              [
                "create",
                "findMany",
                "findFirst",
                "findUnique",
                "update",
                "delete",
                "count",
                "upsert",
              ].includes(method)
            ) {
              return async () => (method === "count" ? 0 : null);
            }
            if (method === "aggregate") return async () => ({});
            return undefined;
          },
        }
      );
    },
  };
  return new Proxy({}, handler);
}

let db;

try {
  const globalForPrisma = globalThis;
  db = globalForPrisma.prisma || new PrismaClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
} catch (err) {
  console.warn("[db] Prisma init failed, using no-op DB client:", err.message);
  db = createNoOpDB();
}

export { db };
