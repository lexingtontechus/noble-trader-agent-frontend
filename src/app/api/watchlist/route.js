/**
 * BFF Route: /api/watchlist
 * Persists user watchlist to Clerk's unsafeMetadata.
 *
 * GET  — Returns the user's saved watchlist from Clerk metadata
 * POST — Saves the watchlist to Clerk metadata
 *        Body: { watchlist: [{ symbol, name }, ...] }
 * PATCH — Merges symbols into the existing watchlist (add only)
 *        Body: { symbols: [{ symbol, name }, ...] }
 * DELETE — Removes specific symbols from the watchlist
 *        Body: { symbols: ["AAPL", "MSFT"] }
 */

import { auth, clerkClient } from "@clerk/nextjs/server";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const watchlist = user.unsafeMetadata?.watchlist || [];

    return Response.json({ watchlist });
  } catch (err) {
    console.error("[watchlist GET] Error:", err.message);
    return Response.json({ error: "Failed to load watchlist" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { watchlist } = body;

    if (!Array.isArray(watchlist)) {
      return Response.json({ error: "watchlist must be an array" }, { status: 400 });
    }

    // Validate and normalize each item
    const normalized = watchlist
      .filter(
        (item) =>
          item &&
          typeof item.symbol === "string" &&
          item.symbol.trim().length > 0
      )
      .map((item) => ({
        symbol: item.symbol.trim().toUpperCase(),
        name: typeof item.name === "string" ? item.name.trim() : item.symbol,
      }));

    // Deduplicate by symbol
    const seen = new Set();
    const deduped = normalized.filter((item) => {
      if (seen.has(item.symbol)) return false;
      seen.add(item.symbol);
      return true;
    });

    // Limit to 100 symbols
    const limited = deduped.slice(0, 100);

    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      unsafeMetadata: { watchlist: limited },
    });

    return Response.json({ watchlist: limited, count: limited.length });
  } catch (err) {
    console.error("[watchlist POST] Error:", err.message);
    return Response.json({ error: "Failed to save watchlist" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { symbols } = body;

    if (!Array.isArray(symbols)) {
      return Response.json({ error: "symbols must be an array" }, { status: 400 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const existing = user.unsafeMetadata?.watchlist || [];

    // Merge new symbols (avoid duplicates)
    const existingSet = new Set(existing.map((w) => w.symbol));
    const newItems = symbols
      .filter(
        (item) =>
          item &&
          typeof item.symbol === "string" &&
          item.symbol.trim().length > 0 &&
          !existingSet.has(item.symbol.trim().toUpperCase())
      )
      .map((item) => ({
        symbol: item.symbol.trim().toUpperCase(),
        name: typeof item.name === "string" ? item.name.trim() : item.symbol,
      }));

    const merged = [...existing, ...newItems].slice(0, 100);

    await client.users.updateUserMetadata(userId, {
      unsafeMetadata: { watchlist: merged },
    });

    return Response.json({ watchlist: merged, added: newItems.length });
  } catch (err) {
    console.error("[watchlist PATCH] Error:", err.message);
    return Response.json({ error: "Failed to update watchlist" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { symbols } = body;

    if (!Array.isArray(symbols)) {
      return Response.json({ error: "symbols must be an array" }, { status: 400 });
    }

    const removeSet = new Set(
      symbols.map((s) => (typeof s === "string" ? s.trim().toUpperCase() : ""))
    );

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const existing = user.unsafeMetadata?.watchlist || [];
    const filtered = existing.filter((w) => !removeSet.has(w.symbol));

    await client.users.updateUserMetadata(userId, {
      unsafeMetadata: { watchlist: filtered },
    });

    return Response.json({ watchlist: filtered, removed: existing.length - filtered.length });
  } catch (err) {
    console.error("[watchlist DELETE] Error:", err.message);
    return Response.json({ error: "Failed to delete from watchlist" }, { status: 500 });
  }
}
