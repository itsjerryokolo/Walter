import { z } from "zod"
import type { FastMCP } from "fastmcp"
import type { MasterTreasurer } from "../../treasurer/master-treasurer.js"
import { baseUnitsToUsdc } from "../../config/env.js"

/**
 * Register budget management tools
 */
export function registerBudgetTools(
  mcp: FastMCP,
  treasurer: MasterTreasurer
): void {
  // Get current budget status
  mcp.addTool({
    name: "get_budget_status",
    description:
      "Get the current budget status including total spent, remaining, and daily limits.",
    parameters: z.object({}),
    execute: async () => {
      const status = treasurer.getBudgetStatus()

      return JSON.stringify(
        {
          total_budget_usdc: baseUnitsToUsdc(status.totalBudget).toFixed(2),
          total_spent_usdc: baseUnitsToUsdc(status.totalSpent).toFixed(2),
          remaining_usdc: baseUnitsToUsdc(status.remaining).toFixed(2),
          daily_spent_usdc: baseUnitsToUsdc(status.dailySpent).toFixed(2),
          daily_remaining_usdc: baseUnitsToUsdc(status.dailyRemaining).toFixed(2),
          spending_by_agent: status.byAgent.map((a) => ({
            agent: a.agentName,
            spent_usdc: baseUnitsToUsdc(a.spent).toFixed(2),
            percentage: a.percentage.toFixed(1) + "%",
          })),
          last_updated: status.lastUpdated.toISOString(),
        },
        null,
        2
      )
    },
  })

  // Get recent payments
  mcp.addTool({
    name: "get_payment_history",
    description:
      "Get recent payment history showing transactions with sub-agents.",
    parameters: z.object({
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe("Number of recent payments to retrieve"),
    }),
    execute: async (args) => {
      const entries = treasurer.getRecentPayments(args.limit)

      return JSON.stringify(
        {
          payments: entries.map((entry) => ({
            id: entry.id,
            timestamp: entry.timestamp.toISOString(),
            agent: entry.agentId,
            tool: entry.toolName,
            amount_usdc: baseUnitsToUsdc(entry.amount).toFixed(6),
            status: entry.status,
            error: entry.error,
          })),
          total_entries: entries.length,
        },
        null,
        2
      )
    },
  })
}
