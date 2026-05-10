// Prisma client for Supabase PostgreSQL.
// Uses connection limiting for serverless environments.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

const db =
  globalForPrisma.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export { db };
