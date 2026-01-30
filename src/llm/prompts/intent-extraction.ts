import type { SubAgentDescriptor } from "../../types/index.js"

/**
 * Build the system prompt for intent extraction
 */
export function buildIntentExtractionPrompt(
  agents: SubAgentDescriptor[]
): string {
  const agentDescriptions = agents
    .map((agent) => {
      const toolList = agent.tools
        .map((t) => `    - ${t.name}: ${t.description}`)
        .join("\n")
      const keywords = agent.capabilities
        .flatMap((c) => c.keywords)
        .slice(0, 10)
        .join(", ")

      return `
## ${agent.name} (${agent.id})
${agent.description}

**Capabilities**: ${agent.capabilities.map((c) => c.category).join(", ")}
**Keywords**: ${keywords}

**Available Tools**:
${toolList}`
    })
    .join("\n\n")

  return `You are an intent extraction system for a master agent that orchestrates multiple sub-agents. Your job is to analyze user messages and determine which sub-agent and tool should handle the request.

# Available Sub-Agents
${agentDescriptions}

# Your Task
Analyze the user's message and extract:
1. The most appropriate sub-agent to handle the request
2. The specific tool to use
3. The arguments needed for that tool
4. Your confidence level (0.0 to 1.0)

# Response Format
Respond with a JSON object in this exact format:
\`\`\`json
{
  "agentId": "string - ID of the selected agent",
  "toolName": "string - name of the tool to call",
  "arguments": { "key": "value" },
  "confidence": 0.95,
  "reasoning": "Brief explanation of why this agent/tool was selected"
}
\`\`\`

# Guidelines
- Match user intent to agent capabilities and keywords
- Select the most specific tool for the task
- Extract tool arguments from the user's message
- For entity IDs (like sensor.temperature), infer based on context
- If the request doesn't match any agent, respond with agentId: null
- If you need more information to determine arguments, include what you know and set confidence lower

# Common Patterns
- "What's the temperature?" → carol/get_sensor_reading with temperature sensor
- "Show me all sensors" → carol/get_all_sensors
- "Get device status" → carol/get_device_state
- "Energy usage today" → carol/get_energy_usage with period: "day"
- "Climate summary" → carol/get_climate_summary`
}

/**
 * Build user message for intent extraction
 */
export function buildIntentExtractionUserMessage(
  userMessage: string,
  conversationContext?: string
): string {
  let message = `User message: "${userMessage}"`

  if (conversationContext) {
    message = `Previous context:\n${conversationContext}\n\n${message}`
  }

  return message
}

/**
 * Expected response structure from intent extraction
 */
export interface IntentExtractionResult {
  agentId: string | null
  toolName: string | null
  arguments: Record<string, unknown>
  confidence: number
  reasoning: string
}
