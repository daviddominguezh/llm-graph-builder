# Agent Execution Runtime (Sub-project 3) — Design Spec

## Overview

Add an agent execution loop to the `api` package and expose it via a simulation/execution endpoint. The agent loop invokes an LLM with a system prompt + context, handles tool calls, and iterates until the LLM stops calling tools or max steps is reached. Generates the same trace/persistence data as workflow execution.

---

## 1. Agent Execution Loop

New exported function in `packages/api`:

```ts
export async function executeAgent(config: AgentExecutionConfig): Promise<AgentExecutionResult>
export async function executeAgentWithCallbacks(
  config: AgentExecutionConfig,
  callbacks: AgentCallbacks
): Promise<AgentExecutionResult>
```

### AgentExecutionConfig
```ts
interface AgentExecutionConfig {
  systemPrompt: string;
  context: string;           // flattened context items
  messages: Message[];       // conversation history
  apiKey: string;            // OpenRouter key
  modelId: string;
  maxSteps: number | null;   // null = unlimited (capped at a hard limit, e.g. 50)
  mcpServers: McpServerConfig[];
  tools: ToolDefinition[];   // discovered tools from MCP servers
}
```

### Execution loop pseudocode
```
messages = [system_message(systemPrompt + context), ...history, user_message]
step = 0

while (step < maxSteps or maxSteps is null) and step < HARD_LIMIT:
  response = callLLM(messages, tools)
  step++

  emit onStepProcessed(step, messages_sent, response, tokens)

  if response has no tool_calls:
    break  // agent is done, final text response

  for each tool_call in response.tool_calls:
    result = executeTool(tool_call)
    emit onToolExecuted(step, tool_call, result)
    append assistant_message(response) to messages
    append tool_result_message(result) to messages

return { finalText: response.text, steps: step, totalTokens, toolCalls }
```

### AgentCallbacks
```ts
interface AgentCallbacks {
  onStepProcessed: (event: AgentStepEvent) => void;
  onToolExecuted?: (event: AgentToolEvent) => void;
}

interface AgentStepEvent {
  step: number;
  messagesSent: Message[];
  response: LLMResponse;
  tokens: TokenLog;
  durationMs: number;
}

interface AgentToolEvent {
  step: number;
  toolCall: ToolCallRecord;
  result: unknown;
}
```

---

## 2. Hard Step Limit

Even when `maxSteps` is null, there's a hard ceiling (e.g. 50 steps) to prevent infinite loops. This is a constant in the runtime, not user-configurable.

---

## 3. Simulation Endpoint

New endpoint `POST /simulate-agent` (or extend `/simulate` with type discrimination).

Request:
```ts
interface SimulateAgentRequest {
  appType: 'agent';
  systemPrompt: string;
  context: string;
  messages: Message[];
  apiKey: string;
  modelId: string;
  maxSteps: number | null;
  mcpServers: McpServerConfig[];
  tools: ToolDefinition[];
}
```

Response: SSE stream with events:
- `step_started: { step: number }`
- `step_processed: { step, messagesSent, response, tokens, durationMs }`
- `tool_executed: { step, toolCall, result }`
- `agent_response: { text, steps, totalTokens, toolCalls }`
- `error: { message }`
- `simulation_complete`

The frontend `useSimulation` hook handles these events when `appType === 'agent'`.

---

## 4. Execution Endpoint (Production)

The existing `/api/agents/:slug/:version` execution endpoint is extended:
- Checks `app_type` from the published version snapshot
- For workflows: existing graph walker (unchanged)
- For agents: calls `executeAgentWithCallbacks` with the agent config from the version snapshot

Persistence is identical:
- Creates session (or reuses existing)
- Creates execution record
- Saves messages (user + assistant)
- Saves step visits (replaces node visits — `agent_execution_nodes` rows with `node_id` as `step-{N}`)
- Completes execution with totals

---

## 5. MCP Tool Execution

The agent runtime reuses the same MCP tool execution infrastructure:
- `discoverMcpTools` to get available tools
- `callMcpTool` to execute a specific tool
- Tool definitions follow the same schema

The runtime receives pre-discovered tools and handles tool calls within the loop.

---

## 6. Token & Cost Tracking

Each LLM call within a step produces a `TokenLog` entry. These are aggregated:
- Per-step: input, output, cached, cost, duration
- Per-execution: totals across all steps
- Stored in `agent_execution_nodes` (one row per step)

---

## 7. Types Package Changes

New types exported from `@daviddh/graph-types` or the `api` package:
- `AgentExecutionConfig`
- `AgentExecutionResult`
- `AgentStepEvent`
- `AgentToolEvent`
- `AgentCallbacks`
