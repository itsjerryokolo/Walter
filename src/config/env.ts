import { z } from "zod"
import "dotenv/config"

const NetworkSchema = z.enum([
  "base",
  "base-sepolia",
  "avalanche",
  "avalanche-fuji",
  "polygon",
  "polygon-amoy",
])

export type Network = z.infer<typeof NetworkSchema>

const EnvSchema = z.object({
  // Server
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // LLM (Claude/Anthropic)
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  LLM_MODEL: z.string().default("claude-sonnet-4-20250514"),

  // Payment (Buyer wallet)
  BUYER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "BUYER_PRIVATE_KEY must be a valid private key"),
  X402_NETWORK: NetworkSchema.default("base-sepolia"),

  // Smart Account (optional)
  SMART_ACCOUNT_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  SMART_ACCOUNT_KEY_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .optional(),
  SMART_ACCOUNT_VALIDATOR_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),

  // Budget (USDC amounts - will be converted to base units internally)
  TOTAL_BUDGET_USDC: z.coerce.number().positive().default(100),
  DAILY_LIMIT_USDC: z.coerce.number().positive().default(10),
  PER_REQUEST_LIMIT_USDC: z.coerce.number().positive().default(5),
  AUTO_APPROVE_UNDER_USDC: z.coerce.number().nonnegative().default(1),

  // Sub-agents
  CAROL_URL: z.string().url().default("http://localhost:3000/mcp"),

  // Session storage
  SESSION_STORAGE: z.enum(["memory", "redis", "sqlite"]).default("memory"),
  REDIS_URL: z.string().url().optional(),
  SQLITE_PATH: z.string().default("./data/sessions.db"),
})

export type Env = z.infer<typeof EnvSchema>

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env)
  if (!result.success) {
    console.error("Invalid environment configuration:")
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`)
    }
    process.exit(1)
  }
  return result.data
}

export const env = loadEnv()

// USDC has 6 decimals
const USDC_DECIMALS = 6

/**
 * Convert USDC amount to base units (6 decimals)
 */
export function usdcToBaseUnits(amount: number): string {
  return (amount * 10 ** USDC_DECIMALS).toString()
}

/**
 * Convert base units to USDC amount
 */
export function baseUnitsToUsdc(baseUnits: string): number {
  return Number(baseUnits) / 10 ** USDC_DECIMALS
}

/**
 * Budget configuration in base units
 */
export const budgetConfig = {
  totalBudget: usdcToBaseUnits(env.TOTAL_BUDGET_USDC),
  dailyLimit: usdcToBaseUnits(env.DAILY_LIMIT_USDC),
  perRequestLimit: usdcToBaseUnits(env.PER_REQUEST_LIMIT_USDC),
  autoApproveUnder: usdcToBaseUnits(env.AUTO_APPROVE_UNDER_USDC),
}
