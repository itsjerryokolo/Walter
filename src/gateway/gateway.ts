import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { SubAgentRegistry } from "../registry/registry.js"
import type { ToolResult } from "../types/index.js"
import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker.js"

interface TextContent {
  type: "text"
  text: string
}

export interface GatewayConfig {
  defaultTimeout?: number
  circuitBreaker?: {
    failureThreshold?: number
    successThreshold?: number
    timeout?: number
  }
}

/**
 * Communication gateway for sub-agent interactions
 *
 * Handles:
 * - Tool invocation with automatic payment handling (via registry clients)
 * - Circuit breaker for resilience
 * - Retry logic for transient failures
 */
export class SubAgentGateway {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map()
  private config: GatewayConfig

  constructor(
    private registry: SubAgentRegistry,
    config?: GatewayConfig
  ) {
    this.config = {
      defaultTimeout: config?.defaultTimeout ?? 30000,
      circuitBreaker: config?.circuitBreaker,
    }
  }

  /**
   * Call a tool on a sub-agent
   *
   * The registry's MCP client handles payment retry automatically.
   */
  async callTool(
    agentId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const agent = this.registry.getAgent(agentId)
    if (!agent) {
      return {
        success: false,
        error: `Agent not found: ${agentId}`,
      }
    }

    const client = this.registry.getClient(agentId)
    if (!client) {
      return {
        success: false,
        error: `No connection to agent: ${agentId}`,
      }
    }

    // Get or create circuit breaker for this agent
    const circuitBreaker = this.getCircuitBreaker(agentId)

    try {
      const result = await circuitBreaker.execute(async () => {
        // MCP client handles payment automatically via treasurer
        const response = await client.callTool({
          name: toolName,
          arguments: args,
        })

        return response as CallToolResult
      })

      // Parse the result
      if (result.isError) {
        return {
          success: false,
          error:
            result.content
              .filter((c): c is TextContent => c.type === "text")
              .map((c) => c.text)
              .join("\n") || "Tool returned an error",
        }
      }

      // Extract text content from result
      const textContent = result.content
        .filter((c): c is TextContent => c.type === "text")
        .map((c) => c.text)
        .join("\n")

      // Try to parse as JSON if it looks like JSON
      let data: unknown = textContent
      try {
        if (textContent.startsWith("{") || textContent.startsWith("[")) {
          data = JSON.parse(textContent)
        }
      } catch {
        // Keep as string if not valid JSON
      }

      return {
        success: true,
        data,
      }
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        return {
          success: false,
          error: `Agent ${agentId} is temporarily unavailable. ${error.message}`,
        }
      }

      // Handle other errors
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred"
      console.error(`[Gateway] Error calling ${agentId}/${toolName}:`, error)

      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  /**
   * Call a tool with fallback agents
   */
  async callToolWithFallback(
    primaryAgentId: string,
    toolName: string,
    args: Record<string, unknown>,
    fallbackAgentIds: string[]
  ): Promise<ToolResult> {
    // Try primary agent first
    const primaryResult = await this.callTool(primaryAgentId, toolName, args)
    if (primaryResult.success) {
      return primaryResult
    }

    // Try fallback agents
    for (const fallbackId of fallbackAgentIds) {
      const fallbackAgent = this.registry.getAgent(fallbackId)
      if (!fallbackAgent || fallbackAgent.status !== "healthy") {
        continue
      }

      // Check if fallback has the same tool
      const hasTool = fallbackAgent.tools.some((t) => t.name === toolName)
      if (!hasTool) {
        continue
      }

      console.log(
        `[Gateway] Primary agent ${primaryAgentId} failed, trying fallback: ${fallbackId}`
      )
      const fallbackResult = await this.callTool(fallbackId, toolName, args)
      if (fallbackResult.success) {
        return fallbackResult
      }
    }

    // All agents failed
    return {
      success: false,
      error: `All agents failed for tool ${toolName}. Primary: ${primaryAgentId}`,
    }
  }

  /**
   * Get or create circuit breaker for an agent
   */
  private getCircuitBreaker(agentId: string): CircuitBreaker {
    let cb = this.circuitBreakers.get(agentId)
    if (!cb) {
      cb = new CircuitBreaker(agentId, this.config.circuitBreaker)
      this.circuitBreakers.set(agentId, cb)
    }
    return cb
  }

  /**
   * Get circuit breaker stats for all agents
   */
  getCircuitBreakerStats(): Record<
    string,
    {
      state: string
      failures: number
      successes: number
      lastFailure: Date | null
    }
  > {
    const stats: Record<
      string,
      {
        state: string
        failures: number
        successes: number
        lastFailure: Date | null
      }
    > = {}
    for (const [agentId, cb] of this.circuitBreakers) {
      stats[agentId] = cb.getStats()
    }
    return stats
  }

  /**
   * Reset circuit breaker for an agent
   */
  resetCircuitBreaker(agentId: string): void {
    const cb = this.circuitBreakers.get(agentId)
    if (cb) {
      cb.reset()
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuitBreakers(): void {
    for (const cb of this.circuitBreakers.values()) {
      cb.reset()
    }
  }
}
