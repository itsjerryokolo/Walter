import { FastMCP } from "fastmcp"
import type { SubAgentRegistry } from "../registry/registry.js"
import type { SubAgentGateway } from "../gateway/gateway.js"
import type { IntentRouter } from "../router/intent-router.js"
import type { MasterTreasurer } from "../treasurer/master-treasurer.js"
import type { SessionManager } from "../session/session-manager.js"
import { registerChatTool } from "./tools/chat.js"
import { registerQueryTool } from "./tools/query.js"
import { registerBudgetTools } from "./tools/budget.js"
import { env } from "../config/env.js"

export interface McpServerConfig {
  registry: SubAgentRegistry
  gateway: SubAgentGateway
  router: IntentRouter
  treasurer: MasterTreasurer
  sessionManager: SessionManager
}

/**
 * Create and configure the FastMCP server
 */
export function createMcpServer(config: McpServerConfig): FastMCP {
  const mcp = new FastMCP({
    name: "master-agent",
    version: "0.1.0",
  })

  // Register tools
  registerChatTool(mcp, config.router, config.sessionManager)
  registerQueryTool(mcp, config.registry, config.gateway)
  registerBudgetTools(mcp, config.treasurer)

  return mcp
}

/**
 * Start the MCP server
 */
export async function startMcpServer(mcp: FastMCP): Promise<void> {
  const port = env.PORT

  await mcp.start({
    transportType: "httpStream",
    httpStream: {
      port,
    },
  })

  console.log(`[MCP Server] Master Agent started on port ${port}`)
  console.log(`[MCP Server] MCP endpoint: http://localhost:${port}/mcp`)
}
