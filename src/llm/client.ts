import Anthropic from "@anthropic-ai/sdk"
import { env } from "../config/env.js"

export interface LLMMessage {
  role: "user" | "assistant"
  content: string
}

export interface LLMResponse {
  content: string
  stopReason: string | null
}

/**
 * Claude LLM client for the master agent
 *
 * Handles all LLM interactions including intent extraction and response synthesis.
 */
export class ClaudeLLMClient {
  private client: Anthropic

  constructor() {
    this.client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    })
  }

  /**
   * Generate a response from Claude
   */
  async generate(
    systemPrompt: string,
    messages: LLMMessage[],
    maxTokens: number = 1024
  ): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: env.LLM_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    })

    // Extract text from response
    const textContent = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n")

    return {
      content: textContent,
      stopReason: response.stop_reason,
    }
  }

  /**
   * Generate a structured response (JSON) from Claude
   */
  async generateStructured<T>(
    systemPrompt: string,
    messages: LLMMessage[],
    maxTokens: number = 1024
  ): Promise<T> {
    const response = await this.generate(systemPrompt, messages, maxTokens)

    // Extract JSON from response
    const jsonMatch = response.content.match(/```json\n([\s\S]*?)\n```/)
    const jsonStr = jsonMatch ? jsonMatch[1] : response.content

    try {
      return JSON.parse(jsonStr ?? "") as T
    } catch {
      // Try to find JSON in the response
      const jsonStart = response.content.indexOf("{")
      const jsonEnd = response.content.lastIndexOf("}") + 1
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        return JSON.parse(response.content.slice(jsonStart, jsonEnd)) as T
      }
      throw new Error(`Failed to parse structured response: ${response.content}`)
    }
  }

  /**
   * Generate with tool use (for more complex scenarios)
   */
  async generateWithTools(
    systemPrompt: string,
    messages: LLMMessage[],
    tools: Anthropic.Tool[],
    maxTokens: number = 1024
  ): Promise<Anthropic.Message> {
    return this.client.messages.create({
      model: env.LLM_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      tools,
    })
  }
}
