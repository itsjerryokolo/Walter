import type { Session, Message } from "../types/index.js"

/**
 * Session manager for conversation context
 *
 * Maintains session state including conversation history and variables.
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map()
  private readonly maxMessages: number = 50 // Max messages to keep per session
  private readonly sessionTimeout: number = 3600000 // 1 hour

  /**
   * Get or create a session
   */
  getOrCreate(sessionId: string): Session {
    let session = this.sessions.get(sessionId)

    if (!session) {
      session = {
        id: sessionId,
        createdAt: new Date(),
        lastActivity: new Date(),
        messages: [],
        subAgentContexts: new Map(),
        variables: new Map(),
      }
      this.sessions.set(sessionId, session)
      console.log(`[SessionManager] Created new session: ${sessionId}`)
    } else {
      session.lastActivity = new Date()
    }

    return session
  }

  /**
   * Get a session without creating
   */
  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Add a message to a session
   */
  addMessage(sessionId: string, message: Message): void {
    const session = this.getOrCreate(sessionId)
    session.messages.push(message)

    // Trim old messages if exceeding max
    if (session.messages.length > this.maxMessages) {
      session.messages = session.messages.slice(-this.maxMessages)
    }

    session.lastActivity = new Date()
  }

  /**
   * Get conversation history for a session
   */
  getHistory(sessionId: string, limit?: number): Message[] {
    const session = this.sessions.get(sessionId)
    if (!session) return []

    const messages = session.messages
    if (limit) {
      return messages.slice(-limit)
    }
    return messages
  }

  /**
   * Set a session variable
   */
  setVariable(sessionId: string, key: string, value: unknown): void {
    const session = this.getOrCreate(sessionId)
    session.variables.set(key, value)
  }

  /**
   * Get a session variable
   */
  getVariable(sessionId: string, key: string): unknown {
    const session = this.sessions.get(sessionId)
    return session?.variables.get(key)
  }

  /**
   * Store sub-agent context ID
   */
  setSubAgentContext(sessionId: string, agentId: string, contextId: string): void {
    const session = this.getOrCreate(sessionId)
    session.subAgentContexts.set(agentId, contextId)
  }

  /**
   * Get sub-agent context ID
   */
  getSubAgentContext(sessionId: string, agentId: string): string | undefined {
    const session = this.sessions.get(sessionId)
    return session?.subAgentContexts.get(agentId)
  }

  /**
   * Clear a session
   */
  clear(sessionId: string): void {
    this.sessions.delete(sessionId)
    console.log(`[SessionManager] Cleared session: ${sessionId}`)
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpired(): number {
    const now = Date.now()
    let cleaned = 0

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity.getTime() > this.sessionTimeout) {
        this.sessions.delete(sessionId)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`[SessionManager] Cleaned up ${cleaned} expired sessions`)
    }

    return cleaned
  }

  /**
   * Get all active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys())
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size
  }
}
