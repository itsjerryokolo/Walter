import type { PaymentPayload, PaymentRequirements } from "x402/types"

/**
 * Sub-agent protocol types
 */
export type AgentProtocol = "mcp" | "a2a"

/**
 * Agent health status
 */
export type AgentStatus = "healthy" | "degraded" | "offline"

/**
 * Capability description for semantic matching
 */
export interface AgentCapability {
  category: string // e.g., "iot", "analytics", "notifications"
  domains: string[] // e.g., ["sensors", "devices", "energy"]
  keywords: string[] // For semantic matching
}

/**
 * Tool descriptor for sub-agent tools
 */
export interface ToolDescriptor {
  name: string
  description: string
  parameters: Record<string, unknown>
  pricing?: string // Cost in USDC base units
}

/**
 * Sub-agent descriptor
 */
export interface SubAgentDescriptor {
  id: string
  name: string
  description: string
  url: string
  protocol: AgentProtocol
  status: AgentStatus
  capabilities: AgentCapability[]
  tools: ToolDescriptor[]
  lastHealthCheck?: Date
  budgetAllocation?: string // USDC in base units
}

/**
 * Sub-agent configuration (for static config)
 */
export interface SubAgentConfig {
  id: string
  name: string
  description: string
  url: string
  protocol: AgentProtocol
  enabled: boolean
  budgetAllocation?: string
  capabilities: AgentCapability[]
  healthCheckPath?: string
  timeout?: number
}

/**
 * Conversation message
 */
export interface Message {
  role: "user" | "assistant" | "system"
  content: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

/**
 * User intent extracted from natural language
 */
export interface Intent {
  action: string // "query", "control", "analyze", "notify"
  targetDomain: string // "iot", "analytics", "automation"
  entities: ExtractedEntity[]
  confidence: number
  rawQuery: string
}

/**
 * Entity extracted from user message
 */
export interface ExtractedEntity {
  type: string // "sensor", "device", "time_range", etc.
  value: string
  normalized?: string
}

/**
 * Routing decision for a user message
 */
export interface RoutingDecision {
  agent: SubAgentDescriptor
  tool: string
  arguments: Record<string, unknown>
  fallbackAgents: SubAgentDescriptor[]
}

/**
 * Session state
 */
export interface Session {
  id: string
  createdAt: Date
  lastActivity: Date
  messages: Message[]
  subAgentContexts: Map<string, string> // agentId -> contextId
  variables: Map<string, unknown> // Session variables (e.g., last queried sensor)
}

/**
 * Budget status
 */
export interface BudgetStatus {
  totalBudget: string
  totalSpent: string
  remaining: string
  dailySpent: string
  dailyRemaining: string
  byAgent: AgentSpending[]
  lastUpdated: Date
}

/**
 * Per-agent spending
 */
export interface AgentSpending {
  agentId: string
  agentName: string
  spent: string
  percentage: number
}

/**
 * Payment ledger entry
 */
export interface PaymentEntry {
  id: string
  timestamp: Date
  agentId: string
  toolName: string
  amount: string
  status: "pending" | "accepted" | "rejected" | "error"
  requirements?: PaymentRequirements
  payment?: PaymentPayload
  error?: string
}

/**
 * Tool result from sub-agent
 */
export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
  paymentInfo?: {
    amount: string
    settled: boolean
  }
}
