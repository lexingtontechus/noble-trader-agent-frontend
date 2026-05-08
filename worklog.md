---
Task ID: 1
Agent: Main Agent
Task: Add FastAPI MCP support to the noble-trader-fastapi-backend repo

Work Log:
- Fetched FastAPI MCP quickstart docs from https://fastapi-mcp.tadata.com/getting-started/quickstart
- Read the backend repo structure: main.py (FastAPI app factory), routers, requirements.txt
- Created Python venv at /home/z/noble-trader-fastapi-backend/.venv
- Installed fastapi-mcp v0.4.0 and all backend dependencies
- Modified main.py to integrate FastApiMCP:
  - Added graceful import (try/except) so app works without fastapi-mcp installed
  - Created FastApiMCP instance with name "Noble Trader MCP" and detailed description
  - Called mcp.mount_http() to mount at /mcp endpoint
  - Updated root endpoint to include "mcp" field and "mcp_server" in endpoints dict
- Added fastapi-mcp>=0.4.0 to requirements.txt
- Tested MCP integration locally:
  - Health endpoint: ✅ returns ok
  - Root endpoint: ✅ shows "mcp": "/mcp"
  - MCP Initialize: ✅ protocol 2024-11-05, session management works
  - MCP Tools List: ✅ 30 tools auto-discovered from all FastAPI endpoints
  - MCP Tool Call: ✅ session-based tool invocation works
- Committed and pushed to GitHub: commit 4d8b7ea

Stage Summary:
- FastAPI MCP fully integrated and working at /mcp endpoint
- 30 endpoints exposed as MCP tools (regime detection, sizing, risk, simulation, correlation, optimisation, etc.)
- Graceful degradation: app runs fine without fastapi-mcp installed
- SSE transport for real-time MCP client connections
- MCP client config: {"mcpServers": {"noble-trader": {"url": "http://localhost:8000/mcp"}}}
