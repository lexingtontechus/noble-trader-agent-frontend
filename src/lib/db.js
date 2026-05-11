// Prisma client with PostgreSQL (Supabase) for Vercel serverless compatibility.
// Previously used SQLite which doesn't work on Vercel's ephemeral filesystem.
// Now uses PostgreSQL via DATABASE_URL (Supabase connection string).

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

const isProduction = process.env.NODE_ENV === "production";

const db =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: isProduction ? ["error"] : ["error", "warn"],
  });

if (!isProduction) globalForPrisma.prisma = db;

// Graceful shutdown — release DB connections when the process exits
if (!globalForPrisma.prismaShutdownRegistered) {
  globalForPrisma.prismaShutdownRegistered = true;
  const shutdown = async () => {
    try {
      await db.$disconnect();
    } catch {}
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

export { db };
