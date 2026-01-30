import { z } from "zod"
import type { FastMCP } from "fastmcp"
import type { IntentRouter } from "../../router/intent-router.js"
import type { SessionManager } from "../../session/session-manager.js"

/**
 * Register the chat tool
 *
 * This is the main interface for users to interact with the master agent.
 */
export function registerChatTool(
  mcp: FastMCP,
  router: IntentRouter,
  sessionManager: SessionManager
): void {
  mcp.addTool({
    name: "chat",
    description:
      "Chat with the master agent using natural language. The agent will understand your request and route it to the appropriate service.",
    parameters: z.object({
      message: z.string().describe("Your message or question"),
      session_id: z
        .string()
        .optional()
        .describe("Optional session ID for multi-turn conversations"),
    }),
    execute: async (args) => {
      const sessionId = args.session_id || `session-${Date.now()}`

      // Get conversation history
      const history = sessionManager.getHistory(sessionId, 10)

      // Add user message to history
      sessionManager.addMessage(sessionId, {
        role: "user",
        content: args.message,
        timestamp: new Date(),
      })

      try {
        // Process the message through the router
        const result = await router.processMessage(args.message, history)

        // Add assistant response to history
        sessionManager.addMessage(sessionId, {
          role: "assistant",
          content: result.response,
          timestamp: new Date(),
          metadata: result.routing
            ? {
                agentId: result.routing.agent.id,
                tool: result.routing.tool,
              }
            : undefined,
        })

        // Return response with session info
        return JSON.stringify(
          {
            response: result.response,
            session_id: sessionId,
            routing: result.routing
              ? {
                  agent: result.routing.agent.name,
                  tool: result.routing.tool,
                }
              : null,
          },
          null,
          2
        )
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred"

        sessionManager.addMessage(sessionId, {
          role: "assistant",
          content: `Error: ${errorMessage}`,
          timestamp: new Date(),
        })

        return JSON.stringify(
          {
            error: errorMessage,
            session_id: sessionId,
          },
          null,
          2
        )
      }
    },
  })
}
