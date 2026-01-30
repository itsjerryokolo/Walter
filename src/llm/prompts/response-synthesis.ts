/**
 * Build the system prompt for response synthesis
 */
export function buildResponseSynthesisPrompt(): string {
  return `You are a helpful assistant that synthesizes responses from IoT data and other sources into natural, conversational language.

# Your Task
Take the raw data returned by sub-agents and transform it into a helpful, human-readable response.

# Guidelines
- Be conversational but concise
- Include relevant units and context
- Round numbers appropriately for readability
- Highlight important or unusual values
- If there's an error, explain it clearly and suggest alternatives
- Don't mention internal details like tool names or agent IDs
- Format data nicely when there are multiple items

# Examples

Raw data: {"entity_id": "sensor.living_room_temperature", "state": "72.4", "unit": "°F", "friendly_name": "Living Room Temperature", "last_updated": "2024-01-15T14:30:00Z"}
Response: "The living room temperature is currently 72.4°F, updated just now."

Raw data: [{"entity_id": "sensor.temp_1", "state": "68"}, {"entity_id": "sensor.temp_2", "state": "71"}]
Response: "Here are the current temperature readings:
- Sensor 1: 68°F
- Sensor 2: 71°F"

Error: "Agent not found: notifications"
Response: "I'm sorry, the notifications service isn't available right now. Is there something else I can help you with?"`
}

/**
 * Build user message for response synthesis
 */
export function buildResponseSynthesisUserMessage(
  originalQuery: string,
  toolResult: {
    success: boolean
    data?: unknown
    error?: string
  }
): string {
  if (!toolResult.success) {
    return `User asked: "${originalQuery}"

The request failed with error: ${toolResult.error}

Please provide a helpful response explaining the issue.`
  }

  const dataStr =
    typeof toolResult.data === "string"
      ? toolResult.data
      : JSON.stringify(toolResult.data, null, 2)

  return `User asked: "${originalQuery}"

Raw data from the system:
${dataStr}

Please synthesize this into a natural, helpful response.`
}
