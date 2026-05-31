/**
 * MCP Tool Discovery: /api/mcp/tools
 *
 * Returns the list of available MCP tools for the current user,
 * filtered by their plan. Uses the backend's MCP tools/list endpoint.
 *
 * Plan-based tool visibility:
 *   - Free:       Read-only tools (regime, sizing read, risk read, portfolio, backtest read)
 *   - Premium:    Read + write tools (+ strategy signals, backtest runs)
 *   - Institutional: All tools including optimization, GPU benchmarks
 *
 * Also returns connection configuration for MCP clients (Claude Desktop, Cursor, etc.)
 */

import { withAuth } from "@/lib/withAuth";
import { FASTAPI_BASE } from "@/lib/config";

const MCP_BASE = `${FASTAPI_BASE}/mcp`;

// Tool categories for plan-based filtering
const TOOL_PLAN_REQUIREMENTS = {
  // Read-only — available to all plans
  "regime/detect": "free",
  "regime/detect-v2": "free",
  "size/kelly": "free",
  "risk/analyse": "free",
  "risk/analyze": "free",
  "analyse/full": "free",
  "portfolio": "free",
  "simulate": "free",
  "observation/build": "free",
  "observation/build-v2": "free",
  "gpu/capabilities": "free",
  "backtest/history": "free",
  "backtest/{id}": "free",
  "feeds/status": "free",
  "stream/sessions": "free",
  "pnl/intraday": "free",
  "pnl/history": "free",
  "pnl/export": "free",
  "pnl/alerts": "free",
  "renko/state": "free",
  "renko/stats": "free",
  "renko/bricks": "free",
  "renko/classified": "free",
  "renko/signals": "free",
  "renko/trades": "free",
  "renko/swing-points": "free",
  "renko/backtest/stats": "free",
  "operational/kill-switch/status": "free",
  "operational/mode": "free",
  "operational/audit-log": "free",
  "operational/throttle/status": "free",

  // Premium — write + compute-heavy
  "strategy/signal": "premium",
  "backtest/run": "premium",
  "backtest/compare": "premium",
  "backtest/optimize": "premium",
  "backtest/export": "premium",
  "size/masaniello": "premium",
  "size/masaniello/batch": "premium",
  "tda/features": "premium",
  "correlation/detect": "premium",
  "renko/backtest/run": "premium",
  "renko/statistics/rigor": "premium",
  "renko/execution/model": "premium",

  // Institutional — full access
  "optimise/full": "institutional",
  "gpu/benchmark": "institutional",
  "operational/reconcile": "institutional",
  "operational/executor/status": "institutional",
};

function getMinPlanForTool(toolName) {
  // Check exact match first
  if (TOOL_PLAN_REQUIREMENTS[toolName]) {
    return TOOL_PLAN_REQUIREMENTS[toolName];
  }
  // Check prefix match (e.g., "regime_detect_v2" matches "regime")
  for (const [prefix, plan] of Object.entries(TOOL_PLAN_REQUIREMENTS)) {
    if (toolName.startsWith(prefix.split("/")[0])) {
      return plan;
    }
  }
  return "free"; // Default: available to all
}

export const GET = withAuth(async (request, context, authContext) => {
  const { userId, role, plan, isApiKey } = authContext;

  try {
    // Get a Clerk JWT for the backend call
    let authHeaders = { "Content-Type": "application/json" };

    if (isApiKey) {
      const originalApiKey = request.headers.get("x-api-key");
      if (originalApiKey) {
        authHeaders["X-API-Key"] = originalApiKey;
      }
    } else {
      try {
        const { auth } = await import("@clerk/nextjs/server");
        const { getToken } = await auth();
        const token = await getToken({ template: "fastapi" }) || await getToken();
        if (token) {
          authHeaders["Authorization"] = `Bearer ${token}`;
        }
      } catch {
        // Proceed without auth — backend may return 401
      }
    }

    // Call backend MCP tools/list
    const upstream = await fetch(MCP_BASE, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
      signal: AbortSignal.timeout(15000),
    });

    let tools = [];
    if (upstream.ok) {
      const data = await upstream.json();
      tools = data?.result?.tools || [];
    }

    // Filter tools by user's plan
    const PLAN_LEVEL = { free: 0, premium: 1, institutional: 2 };
    const userPlanLevel = PLAN_LEVEL[plan] ?? 0;

    const filteredTools = tools.map((tool) => {
      const minPlan = getMinPlanForTool(tool.name);
      const minPlanLevel = PLAN_LEVEL[minPlan] ?? 0;
      return {
        ...tool,
        minPlan,
        available: userPlanLevel >= minPlanLevel,
      };
    });

    // Build connection config for MCP clients
    const backendUrl = FASTAPI_BASE;
    const connectionConfig = {
      // Direct API key connection (recommended for desktop/CLI clients)
      direct: {
        url: `${backendUrl}/mcp`,
        auth: {
          type: "api_key",
          header: "X-API-Key",
          description: "Use your nt_live_... API key",
        },
      },
      // BFF proxy connection (for browser-based clients)
      bff: {
        url: `${process.env.NEXT_PUBLIC_URL || "https://noble-trader-agent-frontend.vercel.app"}/api/mcp`,
        auth: {
          type: "clerk_session",
          description: "Uses your browser session — no API key needed",
        },
      },
      // Claude Desktop configuration
      claude_desktop: {
        mcpServers: {
          "noble-trader": {
            url: `${backendUrl}/mcp`,
            headers: {
              "X-API-Key": "nt_live_YOUR_API_KEY_HERE",
            },
          },
        },
      },
      // Cursor configuration
      cursor: {
        mcpServers: {
          "noble-trader": {
            url: `${backendUrl}/mcp`,
            headers: {
              "X-API-Key": "nt_live_YOUR_API_KEY_HERE",
            },
          },
        },
      },
    };

    return Response.json({
      tools: filteredTools,
      totalTools: filteredTools.length,
      availableTools: filteredTools.filter((t) => t.available).length,
      plan,
      connectionConfig,
      backendHealth: {
        url: `${backendUrl}/health`,
        mcpEndpoint: `${backendUrl}/mcp`,
      },
    });
  } catch (error) {
    console.error("[mcp/tools] Error fetching MCP tools:", error.message);
    return Response.json(
      {
        error: "Failed to fetch MCP tools from backend",
        detail: error.message,
        tools: [],
        totalTools: 0,
        availableTools: 0,
        plan,
      },
      { status: 502 }
    );
  }
}, { minRole: "viewer", rateTier: "data" });
