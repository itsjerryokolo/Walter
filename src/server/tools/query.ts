import { z } from "zod"
import type { FastMCP } from "fastmcp"
import type { SubAgentRegistry } from "../../registry/registry.js"
import type { SubAgentGateway } from "../../gateway/gateway.js"

/**
 * Register the query_subagent tool
 *
 * Allows direct invocation of a specific sub-agent tool.
 */
export function registerQueryTool(
  mcp: FastMCP,
  registry: SubAgentRegistry,
  gateway: SubAgentGateway
): void {
  mcp.addTool({
    name: "query_subagent",
    description:
      "Directly query a specific sub-agent tool. Use this for precise control over which agent and tool to use.",
    parameters: z.object({
      agent_id: z.string().describe("ID of the sub-agent (e.g., 'carol')"),
      tool_name: z
        .string()
        .describe("Name of the tool to call (e.g., 'get_sensor_reading')"),
      arguments: z
        .record(z.unknown())
        .optional()
        .default({})
        .describe("Arguments to pass to the tool"),
    }),
    execute: async (args) => {
      const { agent_id, tool_name, arguments: toolArgs } = args

      // Validate agent exists
      const agent = registry.getAgent(agent_id)
      if (!agent) {
        return JSON.stringify(
          {
            success: false,
            error: `Agent not found: ${agent_id}`,
            available_agents: registry.getAllAgents().map((a) => a.id),
          },
          null,
          2
        )
      }

      // Validate tool exists on agent
      const tool = agent.tools.find((t) => t.name === tool_name)
      if (!tool) {
        return JSON.stringify(
          {
            success: false,
            error: `Tool not found: ${tool_name}`,
            available_tools: agent.tools.map((t) => t.name),
          },
          null,
          2
        )
      }

      // Call the tool
      const result = await gateway.callTool(agent_id, tool_name, toolArgs)

      return JSON.stringify(
        {
          success: result.success,
          agent: agent.name,
          tool: tool_name,
          data: result.data,
          error: result.error,
        },
        null,
        2
      )
    },
  })

  // Also register a tool to list available agents and their tools
  mcp.addTool({
    name: "list_agents",
    description:
      "List all available sub-agents and their tools. Useful for discovering what capabilities are available.",
    parameters: z.object({}),
    execute: async () => {
      const agents = registry.getAllAgents()

      const result = agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        status: agent.status,
        capabilities: agent.capabilities.map((c) => c.category),
        tools: agent.tools.map((t) => ({
          name: t.name,
          description: t.description,
        })),
      }))

      return JSON.stringify(result, null, 2)
    },
  })
}
