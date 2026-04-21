# Agent Debug & Dashboard (Sub-project 4) — Design Spec

## Overview

Build the debug view for agent-type executions. Instead of a canvas with highlighted nodes, agents show a chat interface organized by turns and steps. Reuses the existing dashboard navigation, session list, and execution list. Only the execution detail view changes.

---

## 1. Data Model

Agent executions use the same tables as workflow executions:
- `agent_sessions` — session state (unchanged)
- `agent_executions` — execution records (unchanged)
- `agent_execution_messages` — user/assistant messages (unchanged)
- `agent_execution_nodes` — step traces (reused: `node_id` stores `step-{N}` for agents)

No schema changes needed. The `app_type` on the agent determines which debug view to render.

---

## 2. Dashboard Navigation

The existing dashboard pages remain:
1. Agent summary → Sessions list → Execution list → Debug view

The only change: when opening the debug view, check `app_type`:
- `'workflow'` → render existing `DebugView` (canvas + node inspector)
- `'agent'` → render new `AgentDebugView` (chat + step inspector)

---

## 3. Agent Debug View Layout

New component `AgentDebugView`:

**Left panel — Chat timeline:**
- Messages displayed as a chat interface (user messages on one side, assistant on the other)
- Messages grouped by **turns** (a turn starts with a user message and ends before the next user message)
- Within each turn, **steps** are visible as expandable sections
- Tool calls shown inline with their results
- Each step shows a small token/cost badge

**Right panel — Step inspector:**
- When a step is clicked, shows full detail:
  - Complete messages array sent to the LLM
  - Full LLM response (text + tool calls)
  - Token breakdown (input, output, cached)
  - Cost
  - Duration
  - Model used
- Same presentation as the existing node inspector in the workflow debug view

**Header — Session metadata:**
- Same as workflow debug: timestamps, total tokens, cost, model, channel
- Plus: total steps count

---

## 4. Turn & Step Grouping

A **turn** is defined as:
- Starts with a user message
- Includes all assistant messages and tool calls until the next user message
- The last turn may not end with a user message (it ends with the final assistant response)

A **step** within a turn corresponds to one LLM invocation (one `agent_execution_nodes` row).

The grouping is derived client-side from the execution messages and node visits:
1. Load all messages for the execution
2. Load all step traces (node visits where `node_id` matches `step-*`)
3. Group by turn boundaries (each user message starts a new turn)
4. Within each turn, order steps by `step_order`

---

## 5. Data Fetching

Reuses existing dashboard queries:
- `getExecutionsForSession` — unchanged
- `getNodeVisitsForExecution` — unchanged (step traces use the same table)

New query:
- `getMessagesForExecution(executionId)` — fetches from `agent_execution_messages` ordered by `created_at`

The frontend fetches messages + node visits on execution selection, then derives the turn/step structure client-side.

---

## 6. Component Structure

```
AgentDebugView
├── SessionMetadataBar (reused from workflow debug)
├── ExecutionSelector (reused — list of executions in session)
├── AgentChatTimeline
│   ├── TurnGroup (for each turn)
│   │   ├── UserMessage
│   │   ├── StepCard (for each step in turn)
│   │   │   ├── AssistantMessage
│   │   │   ├── ToolCallDisplay (if tools were called)
│   │   │   └── StepTokenBadge
│   │   └── ...
│   └── ...
└── StepInspector
    ├── MessagesSentView (full messages array)
    ├── LLMResponseView (full response)
    ├── TokenBreakdown
    └── MetadataRow (cost, duration, model)
```

---

## 7. Shared Components

These existing components are reused as-is:
- `SessionMetadataBar` — session info header
- `ExecutionSelector` / execution list UI
- `TokenBreakdown` display
- `MessagesSentView` (or equivalent from workflow node inspector — shows the messages array)
- `LLMResponseView` (shows response text, reasoning, tool calls)

New components specific to agent debug:
- `AgentChatTimeline` — the chat-style message display
- `TurnGroup` — groups messages into turns
- `StepCard` — expandable step within a turn
- `StepInspector` — detail panel for a selected step

---

## 8. Integration Point

The dashboard page that currently renders `DebugView` needs to:
1. Fetch the agent's `app_type` (already available from the session's agent)
2. Conditionally render `DebugView` or `AgentDebugView`

Both views receive the same props (session, executions, selected execution). They differ only in how they render the execution detail.
