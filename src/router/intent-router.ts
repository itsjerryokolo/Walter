import type { SubAgentRegistry } from "../registry/registry.js"
import type { SubAgentGateway } from "../gateway/gateway.js"
import { ClaudeLLMClient } from "../llm/client.js"
import {
  buildIntentExtractionPrompt,
  buildIntentExtractionUserMessage,
  type IntentExtractionResult,
} from "../llm/prompts/intent-extraction.js"
import {
  buildResponseSynthesisPrompt,
  buildResponseSynthesisUserMessage,
} from "../llm/prompts/response-synthesis.js"
import type { ToolResult, Message, RoutingDecision } from "../types/index.js"

/**
 * Intent router for natural language to sub-agent routing
 *
 * Uses Claude to:
 * 1. Extract intent from user messages
 * 2. Route to appropriate sub-agents
 * 3. Synthesize responses
 */
export class IntentRouter {
  private llm: ClaudeLLMClient

  constructor(
    private registry: SubAgentRegistry,
    private gateway: SubAgentGateway
  ) {
    this.llm = new ClaudeLLMClient()
  }

  /**
   * Process a user message and return a response
   */
  async processMessage(
    userMessage: string,
    conversationHistory: Message[] = []
  ): Promise<{ response: string; routing?: RoutingDecision; toolResult?: ToolResult }> {
    // Step 1: Extract intent
    const intent = await this.extractIntent(userMessage, conversationHistory)

    // Handle non-routable requests
    if (!intent.agentId || !intent.toolName) {
      return {
        response: await this.generateDirectResponse(userMessage, conversationHistory),
      }
    }

    // Step 2: Get agent and validate
    const agent = this.registry.getAgent(intent.agentId)
    if (!agent || agent.status !== "healthy") {
      return {
        response: `I'm sorry, the ${intent.agentId} service isn't available right now. ${intent.reasoning}`,
      }
    }

    // Find fallback agents
    const fallbackAgents = this.findFallbackAgents(intent.agentId, intent.toolName)

    const routing: RoutingDecision = {
      agent,
      tool: intent.toolName,
      arguments: intent.arguments,
      fallbackAgents,
    }

    // Step 3: Call the tool
    console.log(
      `[Router] Routing to ${intent.agentId}/${intent.toolName} with args:`,
      intent.arguments
    )

    const toolResult = await this.gateway.callToolWithFallback(
      intent.agentId,
      intent.toolName,
      intent.arguments,
      fallbackAgents.map((a) => a.id)
    )

    // Step 4: Synthesize response
    const response = await this.synthesizeResponse(userMessage, toolResult)

    return { response, routing, toolResult }
  }

  /**
   * Extract intent from user message using Claude
   */
  private async extractIntent(
    userMessage: string,
    conversationHistory: Message[]
  ): Promise<IntentExtractionResult> {
    const agents = this.registry.getAllAgents().filter((a) => a.status === "healthy")

    if (agents.length === 0) {
      return {
        agentId: null,
        toolName: null,
        arguments: {},
        confidence: 0,
        reasoning: "No agents are currently available",
      }
    }

    const systemPrompt = buildIntentExtractionPrompt(agents)

    // Build conversation context
    const contextMessages = conversationHistory
      .slice(-5) // Last 5 messages for context
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")

    const userPrompt = buildIntentExtractionUserMessage(userMessage, contextMessages)

    try {
      const result = await this.llm.generateStructured<IntentExtractionResult>(
        systemPrompt,
        [{ role: "user", content: userPrompt }],
        512
      )

      console.log(`[Router] Intent extracted:`, result)
      return result
    } catch (error) {
      console.error("[Router] Intent extraction failed:", error)
      return {
        agentId: null,
        toolName: null,
        arguments: {},
        confidence: 0,
        reasoning: "Failed to understand the request",
      }
    }
  }

  /**
   * Synthesize a natural language response from tool result
   */
  private async synthesizeResponse(
    userMessage: string,
    toolResult: ToolResult
  ): Promise<string> {
    const systemPrompt = buildResponseSynthesisPrompt()
    const userPrompt = buildResponseSynthesisUserMessage(userMessage, toolResult)

    try {
      const response = await this.llm.generate(
        systemPrompt,
        [{ role: "user", content: userPrompt }],
        512
      )
      return response.content
    } catch (error) {
      console.error("[Router] Response synthesis failed:", error)

      // Fallback to basic response
      if (toolResult.success) {
        return `Here's what I found: ${JSON.stringify(toolResult.data)}`
      } else {
        return `I encountered an error: ${toolResult.error}`
      }
    }
  }

  /**
   * Generate a direct response for non-routable requests
   */
  private async generateDirectResponse(
    userMessage: string,
    conversationHistory: Message[]
  ): Promise<string> {
    const agents = this.registry.getAllAgents()
    const agentList = agents
      .map((a) => `- **${a.name}**: ${a.description}`)
      .join("\n")

    const systemPrompt = `You are a helpful assistant for a smart home system. You can help users interact with various services.

Available services:
${agentList}

If the user's request doesn't match any specific service, provide helpful information about what you can do.
Be conversational and helpful.`

    // Include recent conversation history
    const messages = conversationHistory.slice(-5).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }))
    messages.push({ role: "user", content: userMessage })

    try {
      const response = await this.llm.generate(systemPrompt, messages, 512)
      return response.content
    } catch (error) {
      console.error("[Router] Direct response generation failed:", error)
      return "I'm having trouble processing your request right now. Could you try rephrasing it?"
    }
  }

  /**
   * Find fallback agents that can handle the same tool
   */
  private findFallbackAgents(primaryAgentId: string, toolName: string) {
    return this.registry
      .getAllAgents()
      .filter(
        (agent) =>
          agent.id !== primaryAgentId &&
          agent.status === "healthy" &&
          agent.tools.some((t) => t.name === toolName)
      )
  }
}
