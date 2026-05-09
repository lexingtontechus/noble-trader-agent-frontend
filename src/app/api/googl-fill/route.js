// GOOGL Fill Job - Scheduled order placement for remaining 52 GOOGL shares
// GET: Check status and place order if conditions are met
// POST: Force trigger regardless of timing

const ALPACA_KEY = process.env.ALPACA_API_KEY || process.env.alpacaApiKey || "";
const ALPACA_SECRET = process.env.ALPACA_API_SECRET || process.env.alpacaSecretKey || "";
const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";
const GOOGL_LIMIT = 398;
const TARGET_QTY = 96;

export async function GET(request) {
  const now = new Date();
  const logs = [];

  logs.push(`GOOGL Fill Job check at ${now.toISOString()}`);

  try {
    // Check market
    const clockResp = await fetch(`${ALPACA_BASE}/clock`, {
      headers: {
        "APCA-API-KEY-ID": ALPACA_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET,
      },
    });
    const clock = await clockResp.json();

    if (!clock?.is_open) {
      return Response.json({
        status: "market_closed",
        message: "Market not open. Retry after 9:30 AM ET.",
        clock,
        logs,
      });
    }

    logs.push("Market is OPEN");

    // Check account
    const accountResp = await fetch(`${ALPACA_BASE}/account`, {
      headers: {
        "APCA-API-KEY-ID": ALPACA_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET,
      },
    });
    const account = await accountResp.json();
    const buyingPower = parseFloat(account?.buying_power || "0");
    const equity = parseFloat(account?.equity || "0");
    logs.push(`Equity: $${equity.toLocaleString()} | Buying Power: $${buyingPower.toLocaleString()}`);

    // Check GOOGL position
    let currentGoogl = 0;
    try {
      const posResp = await fetch(`${ALPACA_BASE}/positions/GOOGL`, {
        headers: {
          "APCA-API-KEY-ID": ALPACA_KEY,
          "APCA-API-SECRET-KEY": ALPACA_SECRET,
        },
      });
      const pos = await posResp.json();
      currentGoogl = parseInt(pos?.qty || "0");
    } catch {
      logs.push("No GOOGL position yet");
    }

    // Check pending GOOGL buys
    const ordersResp = await fetch(`${ALPACA_BASE}/orders?status=open&direction=desc&limit=20`, {
      headers: {
        "APCA-API-KEY-ID": ALPACA_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET,
      },
    });
    const orders = await ordersResp.json();
    let pendingGoogl = 0;
    if (Array.isArray(orders)) {
      for (const o of orders) {
        if (o.symbol === "GOOGL" && o.side === "buy") {
          pendingGoogl += parseInt(o.qty || "0");
        }
      }
    }

    const totalGoogl = currentGoogl + pendingGoogl;
    const needed = Math.max(0, TARGET_QTY - totalGoogl);
    logs.push(`GOOGL: current=${currentGoogl}, pending=${pendingGoogl}, total=${totalGoogl}, need=${needed}`);

    if (needed <= 0) {
      return Response.json({
        status: "complete",
        message: `Target of ${TARGET_QTY} GOOGL shares already met!`,
        currentGoogl,
        pendingGoogl,
        totalGoogl,
        logs,
      });
    }

    const estCost = needed * GOOGL_LIMIT;
    let orderQty = needed;

    if (buyingPower < estCost) {
      const affordable = Math.floor(buyingPower / GOOGL_LIMIT);
      if (affordable <= 0) {
        return Response.json({
          status: "insufficient_funds",
          message: `Insufficient buying power ($${buyingPower.toLocaleString()}). Sells may not have cleared.`,
          buyingPower,
          estCost,
          logs,
        });
      }
      orderQty = affordable;
      logs.push(`Adjusted to ${affordable} shares (affordable with current BP)`);
    }

    logs.push(`PLACING ORDER: BUY ${orderQty} GOOGL @ $${GOOGL_LIMIT} GTC`);
    const orderResp = await fetch(`${ALPACA_BASE}/orders`, {
      method: "POST",
      headers: {
        "APCA-API-KEY-ID": ALPACA_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: "GOOGL",
        qty: String(orderQty),
        side: "buy",
        type: "limit",
        limit_price: GOOGL_LIMIT,
        time_in_force: "gtc",
      }),
    });
    const result = await orderResp.json();

    if (result?.error || result?.code) {
      return Response.json({
        status: "order_failed",
        message: result?.message || "Unknown error",
        result,
        logs,
      }, { status: 500 });
    }

    return Response.json({
      status: "order_placed",
      message: `BUY ${orderQty} GOOGL @ $${GOOGL_LIMIT} placed!`,
      order: {
        id: result.id,
        qty: result.qty,
        limit_price: result.limit_price,
        status: result.status,
        time_in_force: result.time_in_force,
      },
      logs,
    });

  } catch (error) {
    return Response.json({
      status: "error",
      message: error.message,
      logs,
    }, { status: 500 });
  }
}

// POST = force trigger
export async function POST(request) {
  try {
    const clockResp = await fetch(`${ALPACA_BASE}/clock`, {
      headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET },
    });
    const clock = await clockResp.json();

    const accountResp = await fetch(`${ALPACA_BASE}/account`, {
      headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET },
    });
    const account = await accountResp.json();
    const buyingPower = parseFloat(account?.buying_power || "0");

    let currentGoogl = 0;
    try {
      const posResp = await fetch(`${ALPACA_BASE}/positions/GOOGL`, {
        headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET },
      });
      const pos = await posResp.json();
      currentGoogl = parseInt(pos?.qty || "0");
    } catch {}

    const ordersResp = await fetch(`${ALPACA_BASE}/orders?status=open&direction=desc&limit=20`, {
      headers: { "APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET },
    });
    const orders = await ordersResp.json();
    let pendingGoogl = 0;
    if (Array.isArray(orders)) {
      for (const o of orders) {
        if (o.symbol === "GOOGL" && o.side === "buy") pendingGoogl += parseInt(o.qty || "0");
      }
    }

    const totalGoogl = currentGoogl + pendingGoogl;
    const needed = Math.max(0, TARGET_QTY - totalGoogl);

    if (needed <= 0) {
      return Response.json({ status: "complete", message: `Target met: ${totalGoogl} GOOGL shares` });
    }

    let orderQty = needed;
    const affordable = Math.floor(buyingPower / GOOGL_LIMIT);
    if (affordable <= 0) {
      return Response.json({ status: "insufficient_funds", message: `Need ${needed} GOOGL but BP=$${buyingPower.toLocaleString()}` });
    }
    if (affordable < needed) orderQty = affordable;

    const orderResp = await fetch(`${ALPACA_BASE}/orders`, {
      method: "POST",
      headers: {
        "APCA-API-KEY-ID": ALPACA_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: "GOOGL",
        qty: String(orderQty),
        side: "buy",
        type: "limit",
        limit_price: GOOGL_LIMIT,
        time_in_force: "gtc",
      }),
    });
    const result = await orderResp.json();

    if (result?.error || result?.code) {
      return Response.json({ status: "order_failed", message: result?.message, result }, { status: 500 });
    }

    return Response.json({
      status: "order_placed",
      message: `BUY ${orderQty} GOOGL @ $${GOOGL_LIMIT}`,
      order: result,
    });

  } catch (error) {
    return Response.json({ status: "error", message: error.message }, { status: 500 });
  }
}
