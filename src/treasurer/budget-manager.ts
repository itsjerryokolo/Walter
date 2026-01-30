import type { BudgetStatus, AgentSpending } from "../types/index.js"
import type { PaymentLedger } from "./payment-ledger.js"
import { baseUnitsToUsdc } from "../config/env.js"

export interface BudgetConfig {
  totalBudget: string // Total USDC budget in base units
  dailyLimit: string // Max daily spend in base units
  perRequestLimit: string // Max per single request in base units
  autoApproveUnder: string // Auto-approve threshold in base units
}

export interface AgentBudgetAllocation {
  agentId: string
  allocated: string // Amount allocated
  reserved: string // Amount reserved for pending operations
}

/**
 * Manages budget allocation and spending limits
 */
export class BudgetManager {
  private agentAllocations: Map<string, AgentBudgetAllocation> = new Map()

  constructor(
    private config: BudgetConfig,
    private ledger: PaymentLedger
  ) {}

  /**
   * Set budget allocation for an agent
   */
  allocateToAgent(agentId: string, amount: string): void {
    this.agentAllocations.set(agentId, {
      agentId,
      allocated: amount,
      reserved: "0",
    })
    console.log(
      `[BudgetManager] Allocated $${baseUnitsToUsdc(amount).toFixed(2)} USDC to agent: ${agentId}`
    )
  }

  /**
   * Check if a payment can be approved based on budget
   */
  canApprove(agentId: string, amount: string): { allowed: boolean; reason?: string } {
    const amountBigInt = BigInt(amount)

    // Check per-request limit
    if (amountBigInt > BigInt(this.config.perRequestLimit)) {
      return {
        allowed: false,
        reason: `Amount exceeds per-request limit of $${baseUnitsToUsdc(this.config.perRequestLimit).toFixed(2)} USDC`,
      }
    }

    // Check daily limit
    const todaySpending = BigInt(this.ledger.getTodaySpending())
    if (todaySpending + amountBigInt > BigInt(this.config.dailyLimit)) {
      return {
        allowed: false,
        reason: `Would exceed daily limit of $${baseUnitsToUsdc(this.config.dailyLimit).toFixed(2)} USDC`,
      }
    }

    // Check total budget
    const totalSpent = BigInt(this.ledger.getTotalSpent())
    if (totalSpent + amountBigInt > BigInt(this.config.totalBudget)) {
      return {
        allowed: false,
        reason: `Would exceed total budget of $${baseUnitsToUsdc(this.config.totalBudget).toFixed(2)} USDC`,
      }
    }

    // Check agent allocation if set
    const allocation = this.agentAllocations.get(agentId)
    if (allocation) {
      const agentSpent = BigInt(this.ledger.getSpentByAgent(agentId))
      const agentReserved = BigInt(allocation.reserved)
      const agentAvailable =
        BigInt(allocation.allocated) - agentSpent - agentReserved
      if (amountBigInt > agentAvailable) {
        return {
          allowed: false,
          reason: `Would exceed agent budget allocation of $${baseUnitsToUsdc(allocation.allocated).toFixed(2)} USDC`,
        }
      }
    }

    return { allowed: true }
  }

  /**
   * Check if amount is below auto-approve threshold
   */
  isAutoApprovable(amount: string): boolean {
    return BigInt(amount) <= BigInt(this.config.autoApproveUnder)
  }

  /**
   * Reserve budget for a pending operation
   */
  reserve(agentId: string, amount: string): string | null {
    const allocation = this.agentAllocations.get(agentId)
    if (!allocation) {
      // No specific allocation - just check global limits
      const check = this.canApprove(agentId, amount)
      if (!check.allowed) {
        return null
      }
      return crypto.randomUUID()
    }

    const check = this.canApprove(agentId, amount)
    if (!check.allowed) {
      return null
    }

    allocation.reserved = (
      BigInt(allocation.reserved) + BigInt(amount)
    ).toString()
    return crypto.randomUUID()
  }

  /**
   * Release a reservation (operation completed or cancelled)
   */
  releaseReservation(agentId: string, amount: string): void {
    const allocation = this.agentAllocations.get(agentId)
    if (allocation) {
      const reserved = BigInt(allocation.reserved)
      const release = BigInt(amount)
      allocation.reserved = (reserved > release ? reserved - release : BigInt(0)).toString()
    }
  }

  /**
   * Get current budget status
   */
  getStatus(): BudgetStatus {
    const totalSpent = this.ledger.getTotalSpent()
    const remaining = (
      BigInt(this.config.totalBudget) - BigInt(totalSpent)
    ).toString()

    const todaySpending = this.ledger.getTodaySpending()
    const dailyRemaining = (
      BigInt(this.config.dailyLimit) - BigInt(todaySpending)
    ).toString()

    // Get per-agent spending
    const byAgent: AgentSpending[] = []
    const agents = new Set<string>()

    // Collect all agent IDs from allocations and ledger
    for (const alloc of this.agentAllocations.values()) {
      agents.add(alloc.agentId)
    }

    for (const agentId of agents) {
      const spent = this.ledger.getSpentByAgent(agentId)
      const spentNum = Number(spent)
      const totalNum = Number(totalSpent)
      byAgent.push({
        agentId,
        agentName: agentId, // Could be enhanced with actual names
        spent,
        percentage: totalNum > 0 ? (spentNum / totalNum) * 100 : 0,
      })
    }

    return {
      totalBudget: this.config.totalBudget,
      totalSpent,
      remaining,
      dailySpent: todaySpending,
      dailyRemaining,
      byAgent,
      lastUpdated: new Date(),
    }
  }

  /**
   * Format budget status for display
   */
  formatStatus(): string {
    const status = this.getStatus()
    const lines = [
      "=== Budget Status ===",
      `Total Budget: $${baseUnitsToUsdc(status.totalBudget).toFixed(2)} USDC`,
      `Total Spent: $${baseUnitsToUsdc(status.totalSpent).toFixed(2)} USDC`,
      `Remaining: $${baseUnitsToUsdc(status.remaining).toFixed(2)} USDC`,
      "",
      `Daily Limit: $${baseUnitsToUsdc(this.config.dailyLimit).toFixed(2)} USDC`,
      `Today's Spending: $${baseUnitsToUsdc(status.dailySpent).toFixed(2)} USDC`,
      `Daily Remaining: $${baseUnitsToUsdc(status.dailyRemaining).toFixed(2)} USDC`,
    ]

    if (status.byAgent.length > 0) {
      lines.push("", "=== By Agent ===")
      for (const agent of status.byAgent) {
        lines.push(
          `${agent.agentName}: $${baseUnitsToUsdc(agent.spent).toFixed(2)} USDC (${agent.percentage.toFixed(1)}%)`
        )
      }
    }

    return lines.join("\n")
  }
}
