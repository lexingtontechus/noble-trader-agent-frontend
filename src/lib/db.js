// Prisma client with Vercel serverless compatibility.
// On Vercel, the filesystem is read-only except for /tmp.
// This module handles:
//   1. Detecting Vercel environment and redirecting SQLite to /tmp
//   2. Auto-pushing schema if the database is empty
//   3. Graceful connection handling

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

// Detect Vercel serverless environment
const isVercel = !!process.env.VERCEL;
const isProduction = process.env.NODE_ENV === "production";

function getDatabaseUrl() {
  const envUrl = process.env.DATABASE_URL;
  if (!envUrl) return "file:./db/custom.db";

  // On Vercel, SQLite must use /tmp (only writable directory)
  // Redirect any file: URL that doesn't point to /tmp
  if (isVercel && envUrl.startsWith("file:")) {
    const path = envUrl.replace(/^file:/, "");
    if (!path.startsWith("/tmp")) {
      return "file:/tmp/noble-trader-db.sqlite";
    }
  }

  return envUrl;
}

const databaseUrl = getDatabaseUrl();

const db =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: isProduction ? ["error"] : ["error", "warn"],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

if (!isProduction) globalForPrisma.prisma = db;

// On Vercel, ensure the database schema exists
if (isVercel && !globalForPrisma.prismaSchemaPushed) {
  globalForPrisma.prismaSchemaPushed = true;

  db.$connect()
    .then(async () => {
      // Check if the schema has been created by trying a simple query
      try {
        await db.analysisRun.count();
      } catch (e) {
        if (
          e.message?.includes("no such table") ||
          e.message?.includes("does not exist") ||
          e.message?.includes("Error querying")
        ) {
          console.log("[db] Schema not found — running prisma db push...");
          try {
            const { execSync } = await import("child_process");
            execSync("npx prisma db push --skip-generate --accept-data-loss", {
              env: { ...process.env, DATABASE_URL: databaseUrl },
              stdio: "pipe",
              timeout: 30000,
            });
            console.log("[db] Schema pushed successfully");
          } catch (pushErr) {
            console.error("[db] Schema push failed:", pushErr.message);
          }
        }
      }
    })
    .catch((err) => {
      console.error("[db] Connection failed:", err.message);
    });
}

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

export { db, databaseUrl };
