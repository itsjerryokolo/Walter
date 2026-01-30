import type { PaymentEntry } from "../types/index.js"
import type { PaymentPayload, PaymentRequirements } from "x402/types"

/**
 * Ledger for tracking payment history and audit logging
 */
export class PaymentLedger {
  private entries: Map<string, PaymentEntry> = new Map()
  private dailySpending: Map<string, string> = new Map() // date -> amount

  /**
   * Record a new payment authorization
   */
  recordAuthorization(
    id: string,
    agentId: string,
    toolName: string,
    requirements: PaymentRequirements,
    payment: PaymentPayload
  ): void {
    const entry: PaymentEntry = {
      id,
      timestamp: new Date(),
      agentId,
      toolName,
      amount: requirements.maxAmountRequired,
      status: "pending",
      requirements,
      payment,
    }
    this.entries.set(id, entry)
    this.logEntry("AUTHORIZED", entry)
  }

  /**
   * Update payment status
   */
  updateStatus(
    id: string,
    status: PaymentEntry["status"],
    error?: string
  ): void {
    const entry = this.entries.get(id)
    if (!entry) {
      console.warn(`[Ledger] Entry not found: ${id}`)
      return
    }

    entry.status = status
    if (error) {
      entry.error = error
    }

    // Track daily spending for accepted payments
    if (status === "accepted") {
      this.addToDailySpending(entry.amount)
    }

    this.logEntry(status.toUpperCase(), entry)
  }

  /**
   * Get payment entry by ID
   */
  getEntry(id: string): PaymentEntry | undefined {
    return this.entries.get(id)
  }

  /**
   * Get all entries for an agent
   */
  getEntriesByAgent(agentId: string): PaymentEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.agentId === agentId)
  }

  /**
   * Get total spent (accepted payments only)
   */
  getTotalSpent(): string {
    let total = BigInt(0)
    for (const entry of this.entries.values()) {
      if (entry.status === "accepted") {
        total += BigInt(entry.amount)
      }
    }
    return total.toString()
  }

  /**
   * Get total spent by agent
   */
  getSpentByAgent(agentId: string): string {
    let total = BigInt(0)
    for (const entry of this.entries.values()) {
      if (entry.agentId === agentId && entry.status === "accepted") {
        total += BigInt(entry.amount)
      }
    }
    return total.toString()
  }

  /**
   * Get today's spending
   */
  getTodaySpending(): string {
    const today = new Date().toISOString().split("T")[0]
    return this.dailySpending.get(today ?? "") ?? "0"
  }

  /**
   * Add amount to daily spending
   */
  private addToDailySpending(amount: string): void {
    const today = new Date().toISOString().split("T")[0]
    if (!today) return
    const current = BigInt(this.dailySpending.get(today) ?? "0")
    this.dailySpending.set(today, (current + BigInt(amount)).toString())
  }

  /**
   * Get recent entries (for display)
   */
  getRecentEntries(limit: number = 10): PaymentEntry[] {
    return Array.from(this.entries.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
  }

  /**
   * Log entry for audit trail
   */
  private logEntry(action: string, entry: PaymentEntry): void {
    const amount = (Number(entry.amount) / 1_000_000).toFixed(6)
    console.log(
      `[Ledger] ${action} | ${entry.id} | Agent: ${entry.agentId} | Tool: ${entry.toolName} | Amount: $${amount} USDC`
    )
  }

  /**
   * Export ledger to JSON for persistence
   */
  exportToJson(): string {
    return JSON.stringify(
      {
        entries: Array.from(this.entries.values()),
        dailySpending: Object.fromEntries(this.dailySpending),
      },
      null,
      2
    )
  }

  /**
   * Import ledger from JSON
   */
  importFromJson(json: string): void {
    const data = JSON.parse(json) as {
      entries: PaymentEntry[]
      dailySpending: Record<string, string>
    }
    this.entries.clear()
    for (const entry of data.entries) {
      entry.timestamp = new Date(entry.timestamp)
      this.entries.set(entry.id, entry)
    }
    this.dailySpending = new Map(Object.entries(data.dailySpending))
  }
}
