import { env, usdcToBaseUnits } from "./env.js"
import type { SubAgentConfig } from "../types/index.js"

/**
 * Default sub-agent configurations
 *
 * These can be overridden via environment variables or a config file.
 */
export const defaultAgents: SubAgentConfig[] = [
  {
    id: "carol",
    name: "Carol",
    description:
      "IoT data monetization agent - access Home Assistant sensor data, device states, and historical metrics",
    url: env.CAROL_URL,
    protocol: "mcp",
    enabled: true,
    budgetAllocation: usdcToBaseUnits(50), // $50 USDC allocated
    capabilities: [
      {
        category: "iot",
        domains: ["sensors", "devices", "history", "energy", "climate"],
        keywords: [
          "temperature",
          "humidity",
          "light",
          "motion",
          "door",
          "window",
          "thermostat",
          "sensor",
          "device",
          "home",
          "smart home",
          "reading",
          "state",
          "energy",
          "power",
          "climate",
          "weather",
        ],
      },
    ],
    healthCheckPath: "/health",
    timeout: 10000,
  },
  // Future agents can be added here
  // {
  //   id: "notifications",
  //   name: "Notifications",
  //   description: "Multi-channel notification delivery - email, SMS, push, webhooks",
  //   url: env.NOTIFICATIONS_URL || "http://localhost:3001/mcp",
  //   protocol: "mcp",
  //   enabled: false,
  //   capabilities: [
  //     {
  //       category: "notifications",
  //       domains: ["email", "sms", "push", "webhook"],
  //       keywords: ["alert", "notify", "send", "email", "message", "sms", "push"],
  //     },
  //   ],
  // },
]

/**
 * Get enabled agents only
 */
export function getEnabledAgents(): SubAgentConfig[] {
  return defaultAgents.filter((agent) => agent.enabled)
}

/**
 * Find agent by ID
 */
export function getAgentById(id: string): SubAgentConfig | undefined {
  return defaultAgents.find((agent) => agent.id === id)
}

/**
 * Find agents by capability category
 */
export function getAgentsByCategory(category: string): SubAgentConfig[] {
  return defaultAgents.filter(
    (agent) =>
      agent.enabled && agent.capabilities.some((cap) => cap.category === category)
  )
}

/**
 * Find agents that might handle a keyword
 */
export function getAgentsByKeyword(keyword: string): SubAgentConfig[] {
  const lowerKeyword = keyword.toLowerCase()
  return defaultAgents.filter(
    (agent) =>
      agent.enabled &&
      agent.capabilities.some((cap) =>
        cap.keywords.some((kw) => kw.toLowerCase().includes(lowerKeyword))
      )
  )
}
