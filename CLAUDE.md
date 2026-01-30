# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Master Agent** is a multi-agent orchestration system that enables natural language interaction with multiple sub-agents through the Model Context Protocol (MCP). It uses Claude for intent extraction and response synthesis, and integrates with the x402 payment protocol for handling paid sub-agent interactions.

### Key Capabilities
- Natural language chat interface that routes to appropriate sub-agents
- Budget-aware payment authorization with configurable limits
- Circuit breaker pattern for resilient sub-agent communication
- Multi-turn conversation context management

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      MASTER AGENT                            │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Session    │  │    Intent    │  │    Sub-Agent     │   │
│  │   Manager    │  │    Router    │  │    Registry      │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                              │
│  ┌──────────────┐  ┌────────────────────────────────────┐   │
│  │   Master     │  │        Communication Gateway        │   │
│  │  Treasurer   │  │  (MCP Clients + Circuit Breakers)  │   │
│  └──────────────┘  └────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌───────────┐   ┌───────────┐   ┌───────────┐
       │   Carol   │   │  Notif.   │   │  Future   │
       │ (IoT Data)│   │  Agent    │   │  Agents   │
       └───────────┘   └───────────┘   └───────────┘
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Development with hot reload
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run tests
pnpm test          # Watch mode
pnpm test:run      # Single run

# Code quality
pnpm lint          # Check linting
pnpm lint:fix      # Fix linting issues
pnpm format        # Check formatting
pnpm format:fix    # Fix formatting

# Debug with MCP Inspector
pnpm inspect
```

## Project Structure

```
src/
├── index.ts                    # Application entry point
├── config/
│   ├── env.ts                  # Environment config with Zod validation
│   └── agents.ts               # Sub-agent configurations
├── server/
│   ├── mcp-server.ts           # FastMCP server setup
│   └── tools/
│       ├── chat.ts             # Natural language chat tool
│       ├── query.ts            # Direct sub-agent query tool
│       └── budget.ts           # Budget management tools
├── llm/
│   ├── client.ts               # Claude/Anthropic client
│   └── prompts/
│       ├── intent-extraction.ts    # Intent parsing prompts
│       └── response-synthesis.ts   # Response generation prompts
├── registry/
│   └── registry.ts             # Sub-agent discovery and health
├── gateway/
│   ├── gateway.ts              # Sub-agent communication
│   └── circuit-breaker.ts      # Resilience patterns
├── router/
│   └── intent-router.ts        # NL to sub-agent routing
├── treasurer/
│   ├── master-treasurer.ts     # X402Treasurer implementation
│   ├── budget-manager.ts       # Budget allocation and limits
│   └── payment-ledger.ts       # Payment audit trail
├── session/
│   └── session-manager.ts      # Conversation state
└── types/
    └── index.ts                # Shared TypeScript types
```

## Key Concepts

### Sub-Agent Registry
Manages MCP client connections to sub-agents. Auto-discovers tools and monitors health.

```typescript
// Sub-agents are configured in src/config/agents.ts
const agent: SubAgentConfig = {
  id: "carol",
  name: "Carol",
  url: "http://localhost:3000/mcp",
  protocol: "mcp",
  capabilities: [{ category: "iot", keywords: ["sensor", "temperature"] }]
}
```

### Master Treasurer
Implements `X402Treasurer` interface with budget controls:
- **Total budget**: Maximum spend across all agents
- **Daily limit**: Maximum spend per day
- **Per-request limit**: Maximum spend per single request
- **Auto-approve threshold**: Payments below this auto-approve

### Intent Router
Uses Claude to extract user intent and route to appropriate sub-agent:
1. Analyzes user message
2. Matches to agent capabilities/keywords
3. Selects appropriate tool
4. Extracts tool arguments
5. Synthesizes natural language response

### Circuit Breaker
Protects against cascading failures:
- Opens after N consecutive failures
- Half-opens after timeout to test recovery
- Closes after successful requests

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `4000` | Server port |
| `NODE_ENV` | No | `development` | Environment |
| `ANTHROPIC_API_KEY` | **Yes** | - | Claude API key |
| `LLM_MODEL` | No | `claude-sonnet-4-20250514` | Model to use |
| `BUYER_PRIVATE_KEY` | **Yes** | - | Wallet for x402 payments |
| `X402_NETWORK` | No | `base-sepolia` | Blockchain network |
| `TOTAL_BUDGET_USDC` | No | `100` | Total budget in USDC |
| `DAILY_LIMIT_USDC` | No | `10` | Daily spend limit |
| `CAROL_URL` | No | `http://localhost:3000/mcp` | Carol agent URL |

## MCP Tools Reference

### `chat`
Main natural language interface.
```
Input:  { message: string, session_id?: string }
Output: { response: string, session_id: string, routing?: {...} }
```

### `query_subagent`
Direct tool invocation on a sub-agent.
```
Input:  { agent_id: string, tool_name: string, arguments?: object }
Output: { success: boolean, data?: any, error?: string }
```

### `list_agents`
Discover available sub-agents and their tools.
```
Output: [{ id, name, status, tools: [...] }]
```

### `get_budget_status`
Check current budget and spending.
```
Output: { total_budget, spent, remaining, daily_spent, ... }
```

### `get_payment_history`
View payment transaction history.
```
Input:  { limit?: number }
Output: { payments: [{ id, agent, tool, amount, status }] }
```

## Adding a New Sub-Agent

1. **Add configuration** in `src/config/agents.ts`:
```typescript
{
  id: "my-agent",
  name: "My Agent",
  description: "What this agent does",
  url: env.MY_AGENT_URL || "http://localhost:3001/mcp",
  protocol: "mcp",
  enabled: true,
  capabilities: [{
    category: "my-category",
    domains: ["domain1", "domain2"],
    keywords: ["keyword1", "keyword2"]
  }]
}
```

2. **Add environment variable** (optional):
```bash
MY_AGENT_URL=http://localhost:3001/mcp
```

3. The registry auto-discovers tools and the router includes it in intent matching.

## Testing

### Unit Tests
```bash
pnpm test:run
```

### Integration Testing
1. Start Carol: `cd ../Carol && pnpm dev`
2. Start Master Agent: `pnpm dev`
3. Use MCP Inspector: `pnpm inspect`

### Manual Testing via Inspector
```
Tool: chat
Arguments: { "message": "What's the temperature?" }
```

## Common Patterns

### Adding a new MCP tool
```typescript
// src/server/tools/my-tool.ts
import { z } from "zod"
import type { FastMCP } from "fastmcp"

export function registerMyTool(mcp: FastMCP): void {
  mcp.addTool({
    name: "my_tool",
    description: "What this tool does",
    parameters: z.object({
      param1: z.string().describe("Description")
    }),
    execute: async (args) => {
      // Implementation
      return JSON.stringify({ result: "..." })
    }
  })
}
```

### Extending the Treasurer
```typescript
// Custom approval logic
class CustomTreasurer extends MasterTreasurer {
  async onPaymentRequired(requirements, context) {
    // Add custom logic (e.g., user confirmation for large amounts)
    if (this.requiresUserApproval(requirements)) {
      return this.requestUserApproval(requirements)
    }
    return super.onPaymentRequired(requirements, context)
  }
}
```

## Dependencies

### Core
- `fastmcp` - MCP server framework
- `@modelcontextprotocol/sdk` - MCP client
- `@ampersend_ai/ampersend-sdk` - x402 payment integration
- `@anthropic-ai/sdk` - Claude LLM client
- `zod` - Runtime type validation
- `viem` - Ethereum utilities

### Dev
- `typescript` - Type checking
- `tsx` - TypeScript execution
- `vitest` - Testing framework
- `eslint` / `prettier` - Code quality

## Troubleshooting

### "Agent not found" errors
- Check if sub-agent is running (`lsof -i :3000`)
- Verify URL in `.env` matches sub-agent port
- Check registry logs for connection errors

### Payment failures
- Verify `BUYER_PRIVATE_KEY` is valid (66 chars, starts with `0x`)
- Check budget limits haven't been exceeded
- Verify network matches sub-agent (`X402_NETWORK`)

### LLM errors
- Verify `ANTHROPIC_API_KEY` is set and valid
- Check rate limits on your API key
- Review intent extraction prompts for edge cases

## Related Projects

- **Carol** (`../Carol`) - IoT data monetization sub-agent
- **ampersend-sdk** (`../ampersend-sdk`) - x402 payment SDK
