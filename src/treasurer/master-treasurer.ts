import type {
  X402Treasurer,
  Authorization,
  PaymentContext,
  PaymentStatus,
  X402Wallet,
} from "@ampersend_ai/ampersend-sdk"
import type { PaymentRequirements } from "x402/types"
import { BudgetManager, type BudgetConfig } from "./budget-manager.js"
import { PaymentLedger } from "./payment-ledger.js"
import { baseUnitsToUsdc } from "../config/env.js"

export interface MasterTreasurerConfig {
  wallet: X402Wallet
  budgetConfig: BudgetConfig
}

/**
 * Master Treasurer with budget management
 *
 * Implements X402Treasurer interface with:
 * - Budget tracking (total, daily, per-request limits)
 * - Auto-approve for small amounts
 * - Payment audit logging
 */
export class MasterTreasurer implements X402Treasurer {
  private wallet: X402Wallet
  private budgetManager: BudgetManager
  private ledger: PaymentLedger

  // Context tracking for payment decisions
  private pendingContexts: Map<string, { agentId: string; toolName: string }> =
    new Map()

  constructor(config: MasterTreasurerConfig) {
    this.wallet = config.wallet
    this.ledger = new PaymentLedger()
    this.budgetManager = new BudgetManager(config.budgetConfig, this.ledger)
  }

  /**
   * Set budget allocation for an agent
   */
  allocateBudgetToAgent(agentId: string, amount: string): void {
    this.budgetManager.allocateToAgent(agentId, amount)
  }

  /**
   * Called when payment is required.
   * Decides whether to approve based on budget and policies.
   */
  async onPaymentRequired(
    requirements: ReadonlyArray<PaymentRequirements>,
    context?: PaymentContext
  ): Promise<Authorization | null> {
    if (requirements.length === 0) {
      console.log("[Treasurer] No payment requirements provided")
      return null
    }

    const requirement = requirements[0]!
    const amount = requirement.maxAmountRequired
    const amountUsdc = baseUnitsToUsdc(amount)

    // Extract agent and tool info from context
    const agentId = this.extractAgentId(context)
    const toolName = this.extractToolName(context)

    console.log(
      `[Treasurer] Payment required: $${amountUsdc.toFixed(6)} USDC for ${agentId}/${toolName}`
    )

    // Check if budget allows this payment
    const budgetCheck = this.budgetManager.canApprove(agentId, amount)
    if (!budgetCheck.allowed) {
      console.log(`[Treasurer] Payment declined: ${budgetCheck.reason}`)
      return null
    }

    // Check if auto-approvable
    if (!this.budgetManager.isAutoApprovable(amount)) {
      console.log(
        `[Treasurer] Amount $${amountUsdc.toFixed(2)} exceeds auto-approve threshold. Requesting confirmation...`
      )
      // In a full implementation, this would queue for user approval
      // For now, we'll auto-approve but log a warning
      console.warn(
        `[Treasurer] WARNING: Auto-approving large payment. Implement user confirmation for production.`
      )
    }

    // Reserve budget
    const reservationId = this.budgetManager.reserve(agentId, amount)
    if (!reservationId) {
      console.log("[Treasurer] Failed to reserve budget")
      return null
    }

    try {
      // Create payment using wallet
      const payment = await this.wallet.createPayment(requirement)
      const authorizationId = crypto.randomUUID()

      // Record in ledger
      this.ledger.recordAuthorization(
        authorizationId,
        agentId,
        toolName,
        requirement,
        payment
      )

      // Track context for status updates
      this.pendingContexts.set(authorizationId, { agentId, toolName })

      console.log(
        `[Treasurer] Payment authorized: ${authorizationId} ($${amountUsdc.toFixed(6)} USDC)`
      )

      return {
        payment,
        authorizationId,
      }
    } catch (error) {
      // Release reservation on failure
      this.budgetManager.releaseReservation(agentId, amount)
      console.error("[Treasurer] Failed to create payment:", error)
      return null
    }
  }

  /**
   * Called with payment status updates
   */
  async onStatus(
    status: PaymentStatus,
    authorization: Authorization,
    _context?: PaymentContext
  ): Promise<void> {
    const { authorizationId } = authorization
    const pendingContext = this.pendingContexts.get(authorizationId)

    console.log(`[Treasurer] Payment ${authorizationId} status: ${status}`)

    // Map status to ledger status
    let ledgerStatus: "pending" | "accepted" | "rejected" | "error"
    switch (status) {
      case "accepted":
        ledgerStatus = "accepted"
        break
      case "rejected":
      case "declined":
        ledgerStatus = "rejected"
        break
      case "error":
        ledgerStatus = "error"
        break
      default:
        ledgerStatus = "pending"
    }

    // Update ledger
    this.ledger.updateStatus(authorizationId, ledgerStatus)

    // Release reservation for non-accepted payments
    if (status !== "accepted" && status !== "sending" && pendingContext) {
      const entry = this.ledger.getEntry(authorizationId)
      if (entry) {
        this.budgetManager.releaseReservation(pendingContext.agentId, entry.amount)
      }
    }

    // Clean up context on terminal status
    if (["accepted", "rejected", "declined", "error"].includes(status)) {
      this.pendingContexts.delete(authorizationId)
    }
  }

  /**
   * Get current budget status
   */
  getBudgetStatus() {
    return this.budgetManager.getStatus()
  }

  /**
   * Get formatted budget status for display
   */
  formatBudgetStatus(): string {
    return this.budgetManager.formatStatus()
  }

  /**
   * Get payment ledger
   */
  getLedger(): PaymentLedger {
    return this.ledger
  }

  /**
   * Get recent payment entries
   */
  getRecentPayments(limit: number = 10) {
    return this.ledger.getRecentEntries(limit)
  }

  /**
   * Extract agent ID from payment context
   */
  private extractAgentId(context?: PaymentContext): string {
    if (!context) return "unknown"

    // Try to extract from metadata
    if (context.metadata?.agentId) {
      return String(context.metadata.agentId)
    }

    // Try to extract from params
    if (context.params?.agentId) {
      return String(context.params.agentId)
    }

    return "unknown"
  }

  /**
   * Extract tool name from payment context
   */
  private extractToolName(context?: PaymentContext): string {
    if (!context) return "unknown"

    // For MCP tools/call method
    if (context.method === "tools/call" && context.params?.name) {
      return String(context.params.name)
    }

    // Try metadata
    if (context.metadata?.toolName) {
      return String(context.metadata.toolName)
    }

    return "unknown"
  }
}
