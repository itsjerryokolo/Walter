import { Client } from "@ampersend_ai/ampersend-sdk/mcp/client"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type {
  SubAgentConfig,
  SubAgentDescriptor,
  AgentStatus,
  ToolDescriptor,
} from "../types/index.js"
import type { X402Treasurer } from "@ampersend_ai/ampersend-sdk"

/**
 * Registry for managing sub-agents
 *
 * Handles discovery, health monitoring, and connection management for sub-agents.
 */
export class SubAgentRegistry {
  private agents: Map<string, SubAgentDescriptor> = new Map()
  private clients: Map<string, Client> = new Map()
  private healthCheckInterval: NodeJS.Timeout | null = null

  constructor(private treasurer: X402Treasurer) {}

  /**
   * Register agents from static configuration
   */
  async registerFromConfig(configs: SubAgentConfig[]): Promise<void> {
    for (const config of configs) {
      if (!config.enabled) {
        console.log(`[Registry] Skipping disabled agent: ${config.name}`)
        continue
      }

      const descriptor: SubAgentDescriptor = {
        id: config.id,
        name: config.name,
        description: config.description,
        url: config.url,
        protocol: config.protocol,
        status: "offline",
        capabilities: config.capabilities,
        tools: [],
        budgetAllocation: config.budgetAllocation,
      }

      this.agents.set(config.id, descriptor)
      console.log(`[Registry] Registered agent: ${config.name} (${config.id})`)

      // Try to connect and discover tools
      await this.connectToAgent(config.id)
    }
  }

  /**
   * Connect to a sub-agent and discover its tools
   */
  async connectToAgent(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      console.error(`[Registry] Agent not found: ${agentId}`)
      return false
    }

    try {
      if (agent.protocol === "mcp") {
        const client = new Client(
          { name: "master-agent", version: "1.0.0" },
          {
            mcpOptions: { capabilities: { tools: {} } },
            treasurer: this.treasurer,
          }
        )

        const transport = new StreamableHTTPClientTransport(new URL(agent.url))
        await client.connect(transport)

        this.clients.set(agentId, client)

        // Discover tools
        const toolsResult = await client.listTools()
        const tools: ToolDescriptor[] = toolsResult.tools.map((tool) => ({
          name: tool.name,
          description: tool.description || "",
          parameters: tool.inputSchema as Record<string, unknown>,
        }))

        agent.tools = tools
        agent.status = "healthy"
        agent.lastHealthCheck = new Date()

        console.log(
          `[Registry] Connected to ${agent.name}: ${tools.length} tools discovered`
        )
        return true
      } else {
        // A2A protocol support can be added here
        console.warn(`[Registry] A2A protocol not yet implemented for ${agent.name}`)
        return false
      }
    } catch (error) {
      console.error(`[Registry] Failed to connect to ${agent.name}:`, error)
      agent.status = "offline"
      agent.lastHealthCheck = new Date()
      return false
    }
  }

  /**
   * Get MCP client for an agent
   */
  getClient(agentId: string): Client | undefined {
    return this.clients.get(agentId)
  }

  /**
   * Get agent descriptor
   */
  getAgent(agentId: string): SubAgentDescriptor | undefined {
    return this.agents.get(agentId)
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): SubAgentDescriptor[] {
    return Array.from(this.agents.values())
  }

  /**
   * Get agents by status
   */
  getAgentsByStatus(status: AgentStatus): SubAgentDescriptor[] {
    return Array.from(this.agents.values()).filter((a) => a.status === status)
  }

  /**
   * Find agents by capability category
   */
  findAgentsByCapability(category: string): SubAgentDescriptor[] {
    return Array.from(this.agents.values()).filter(
      (agent) =>
        agent.status === "healthy" &&
        agent.capabilities.some((cap) => cap.category === category)
    )
  }

  /**
   * Find agents by keyword (searches keywords in capabilities)
   */
  findAgentsByKeyword(keyword: string): SubAgentDescriptor[] {
    const lowerKeyword = keyword.toLowerCase()
    return Array.from(this.agents.values()).filter(
      (agent) =>
        agent.status === "healthy" &&
        agent.capabilities.some((cap) =>
          cap.keywords.some((kw) => kw.toLowerCase().includes(lowerKeyword))
        )
    )
  }

  /**
   * Find agent that has a specific tool
   */
  findAgentByTool(toolName: string): SubAgentDescriptor | undefined {
    for (const agent of this.agents.values()) {
      if (
        agent.status === "healthy" &&
        agent.tools.some((t) => t.name === toolName)
      ) {
        return agent
      }
    }
    return undefined
  }

  /**
   * Get all available tools across all agents
   */
  getAllTools(): Array<{ agent: SubAgentDescriptor; tool: ToolDescriptor }> {
    const result: Array<{ agent: SubAgentDescriptor; tool: ToolDescriptor }> = []
    for (const agent of this.agents.values()) {
      if (agent.status === "healthy") {
        for (const tool of agent.tools) {
          result.push({ agent, tool })
        }
      }
    }
    return result
  }

  /**
   * Check health of a specific agent
   */
  async checkHealth(agentId: string): Promise<AgentStatus> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      return "offline"
    }

    const client = this.clients.get(agentId)
    if (!client) {
      // Try to reconnect
      const connected = await this.connectToAgent(agentId)
      return connected ? "healthy" : "offline"
    }

    try {
      // Ping by listing tools
      await client.listTools()
      agent.status = "healthy"
      agent.lastHealthCheck = new Date()
      return "healthy"
    } catch {
      agent.status = "offline"
      agent.lastHealthCheck = new Date()
      this.clients.delete(agentId)
      return "offline"
    }
  }

  /**
   * Start periodic health monitoring
   */
  startHealthMonitoring(intervalMs: number = 30000): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    this.healthCheckInterval = setInterval(async () => {
      console.log("[Registry] Running health checks...")
      for (const agentId of this.agents.keys()) {
        await this.checkHealth(agentId)
      }
    }, intervalMs)

    console.log(`[Registry] Health monitoring started (interval: ${intervalMs}ms)`)
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
      console.log("[Registry] Health monitoring stopped")
    }
  }

  /**
   * Disconnect from all agents
   */
  async disconnectAll(): Promise<void> {
    this.stopHealthMonitoring()
    for (const [agentId, client] of this.clients) {
      try {
        await client.close()
        console.log(`[Registry] Disconnected from agent: ${agentId}`)
      } catch (error) {
        console.error(`[Registry] Error disconnecting from ${agentId}:`, error)
      }
    }
    this.clients.clear()
  }
}
