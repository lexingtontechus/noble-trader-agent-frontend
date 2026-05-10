// Prisma client for Supabase PostgreSQL.
// Tables use ta_* prefix in the public schema to avoid conflicts.
// Uses graceful shutdown to release connections properly.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

const db =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Graceful shutdown — release DB connections when the process exits
if (!globalForPrisma.prismaShutdownRegistered) {
  globalForPrisma.prismaShutdownRegistered = true;
  const shutdown = async () => {
    try { await db.$disconnect(); } catch {}
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

export { db };
