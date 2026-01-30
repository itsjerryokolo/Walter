import { AccountWallet } from "@ampersend_ai/ampersend-sdk"
import type { Hex } from "viem"

import { env, budgetConfig } from "./config/env.js"
import { getEnabledAgents } from "./config/agents.js"
import { SubAgentRegistry } from "./registry/registry.js"
import { MasterTreasurer } from "./treasurer/master-treasurer.js"
import { SubAgentGateway } from "./gateway/gateway.js"
import { IntentRouter } from "./router/intent-router.js"
import { SessionManager } from "./session/session-manager.js"
import { createMcpServer, startMcpServer } from "./server/mcp-server.js"

async function main() {
  console.log("=".repeat(60))
  console.log("  Walter - Multi-Agent Orchestration System")
  console.log("=".repeat(60))
  console.log()

  // Initialize wallet and treasurer
  console.log("[Init] Setting up wallet and treasurer...")
  const wallet = AccountWallet.fromPrivateKey(env.BUYER_PRIVATE_KEY as Hex)
  const treasurer = new MasterTreasurer({
    wallet,
    budgetConfig,
  })

  // Initialize registry
  console.log("[Init] Setting up sub-agent registry...")
  const registry = new SubAgentRegistry(treasurer)

  // Register enabled agents
  const enabledAgents = getEnabledAgents()
  console.log(`[Init] Found ${enabledAgents.length} enabled agent(s)`)

  await registry.registerFromConfig(enabledAgents)

  // Set up budget allocations
  for (const agentConfig of enabledAgents) {
    if (agentConfig.budgetAllocation) {
      treasurer.allocateBudgetToAgent(agentConfig.id, agentConfig.budgetAllocation)
    }
  }

  // Initialize gateway
  console.log("[Init] Setting up communication gateway...")
  const gateway = new SubAgentGateway(registry, {
    defaultTimeout: 30000,
    circuitBreaker: {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
    },
  })

  // Initialize session manager
  console.log("[Init] Setting up session manager...")
  const sessionManager = new SessionManager()

  // Start session cleanup timer
  setInterval(() => {
    sessionManager.cleanupExpired()
  }, 300000) // Every 5 minutes

  // Initialize intent router
  console.log("[Init] Setting up intent router...")
  const router = new IntentRouter(registry, gateway)

  // Create and start MCP server
  console.log("[Init] Starting MCP server...")
  const mcp = createMcpServer({
    registry,
    gateway,
    router,
    treasurer,
    sessionManager,
  })

  await startMcpServer(mcp)

  // Start health monitoring
  registry.startHealthMonitoring(30000)

  // Print status
  console.log()
  console.log("=".repeat(60))
  console.log("  Walter Ready!")
  console.log("=".repeat(60))
  console.log()
  console.log("Connected agents:")
  for (const agent of registry.getAllAgents()) {
    const statusIcon = agent.status === "healthy" ? "✓" : "✗"
    console.log(`  ${statusIcon} ${agent.name} (${agent.id}): ${agent.status}`)
    console.log(`    Tools: ${agent.tools.map((t) => t.name).join(", ")}`)
  }
  console.log()
  console.log(treasurer.formatBudgetStatus())
  console.log()
  console.log("Available tools:")
  console.log("  - chat: Natural language chat interface")
  console.log("  - query_subagent: Direct sub-agent queries")
  console.log("  - list_agents: List available agents and tools")
  console.log("  - get_budget_status: Check payment budget")
  console.log("  - get_payment_history: View recent payments")
  console.log()

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n[Shutdown] Received SIGINT, shutting down...")
    registry.stopHealthMonitoring()
    await registry.disconnectAll()
    process.exit(0)
  })

  process.on("SIGTERM", async () => {
    console.log("\n[Shutdown] Received SIGTERM, shutting down...")
    registry.stopHealthMonitoring()
    await registry.disconnectAll()
    process.exit(0)
  })
}

// Run
main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
