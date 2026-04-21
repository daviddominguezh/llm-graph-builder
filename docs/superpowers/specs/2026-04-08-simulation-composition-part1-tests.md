# Simulation Composition — Part 1: TDD Contract Tests

## Overview

This is Part 1 of the Simulation Composition spec. It covers the **test suite only** — the behavioral contract that defines how composition state management works. No implementation code is written in this part. The tests define the source of truth; Part 2 implements code to satisfy them.

## What We're Testing

The core challenge of simulation composition is **state management across nesting levels**. Each depth level has its own independent message history. The frontend maintains a composition stack and must:

1. Create isolated message arrays for each child (never shared with parent or siblings)
2. Correctly inject child output as a synthetic tool result when popping back to the parent
3. Preserve parent state (`messages`, `currentNodeId`, `structuredOutputs`) perfectly across multi-turn child interactions
4. Route user input to the correct depth level
5. Build the correct request payload for each depth level

This logic lives in the **frontend** (`packages/web`). The backend is stateless — it receives messages + composition context, runs one execution, and streams events. The backend doesn't manage the stack, doesn't track nesting, and doesn't build message histories.

## Core Types

```typescript
interface CompositionLevel {
  appType: 'agent' | 'workflow';
  messages: Message[];
  currentNodeId?: string;                          // workflows only
  structuredOutputs?: Record<string, unknown[]>;   // workflows only
  dispatchParams: Record<string, unknown>;         // what the parent passed
  parentToolCallId: string;                        // to inject child output back as tool result
}
```

The composition stack is `CompositionLevel[]`. Depth 0 (the root) is managed by existing simulation state — the stack only contains entries for children (depth 1+).

## Functions Under Test

The test suite targets a pure state management module: `packages/web/app/hooks/useCompositionStack.ts`. This module exports pure functions (no React hooks, no side effects) that operate on the composition stack:

```typescript
// Push a new child level when dispatch is detected
function pushChild(
  stack: CompositionLevel[],
  params: {
    appType: 'agent' | 'workflow';
    dispatchParams: Record<string, unknown>;
    parentToolCallId: string;
    task: string;  // becomes the first user message
  }
): CompositionLevel[];

// Pop the top child when it finishes, injecting output into parent's messages
function popChild(
  stack: CompositionLevel[],
  rootMessages: Message[],
  childOutput: string,
  childStatus: 'success' | 'error'
): { stack: CompositionLevel[]; rootMessages: Message[] };

// Get the active depth (stack length, 0 = root)
function getActiveDepth(stack: CompositionLevel[]): number;

// Get the messages array for the active level
function getActiveMessages(stack: CompositionLevel[], rootMessages: Message[]): Message[];

// Append a user message to the active level
function appendUserMessage(
  stack: CompositionLevel[],
  rootMessages: Message[],
  text: string
): { stack: CompositionLevel[]; rootMessages: Message[] };

// Build the request payload for the current active level
function buildCompositionPayload(
  stack: CompositionLevel[],
  rootMessages: Message[]
): SimulationComposition | undefined;
```

These are pure functions: `stack` in, new `stack` out. No mutation. Testable without React, without mocks, without HTTP.

## Test Scenarios

### 1. State Preservation Tests

#### 1a. Message history isolation on push

Push a child onto the stack. Verify:
- The child's messages contain only one user message (the `task`)
- The parent's (root) messages are unchanged
- The child's messages array is a new instance, not a reference to the parent's

#### 1b. Message history isolation at depth 2

Push child (depth 1), then push grandchild (depth 2). Verify:
- Root messages: unchanged
- Child messages: only the child's task message
- Grandchild messages: only the grandchild's task message
- All three message arrays are independent instances

#### 1c. Parent messages preserved after child finishes

Root has messages `[user1, assistant1, user2, assistant2(tool_call)]`. Push child. Child finishes with output "done". Pop child. Verify:
- Root messages are now `[user1, assistant1, user2, assistant2(tool_call), tool_result("done")]`
- The first 4 messages are exactly the same objects (referential equality)
- The 5th message is the synthetic tool result with the child's output

#### 1d. Multi-turn child preserves parent state across appends

Root has 4 messages. Push child. Append user message to child ("hello"). Append another ("world"). Verify:
- Root messages: still exactly 4 messages, unchanged
- Child messages: task message + "hello" + "world" (3 messages)

#### 1e. Workflow parent state preservation

Root is a workflow at node "step-3" with `structuredOutputs: { "step-1": [x], "step-2": [y] }`. Push child. Pop child with output. Verify:
- The popped stack entry's `currentNodeId` was "step-3"
- The popped stack entry's `structuredOutputs` was `{ "step-1": [x], "step-2": [y] }`
- These values are available to restore root state after pop

#### 1f. Composition stack round-trip fidelity

Build a depth-2 stack with specific messages at each level. Serialize to JSON, deserialize. Verify:
- `getActiveDepth` returns 2
- `getActiveMessages` returns the depth-2 messages
- Messages at each level match exactly

### 2. Pop and Inject Tests

#### 2a. Pop injects tool result at root level

Root messages end with `assistant(tool_call, id="tc-1")`. Push child with `parentToolCallId="tc-1"`. Pop with output "result". Verify:
- Root messages gain one new entry: a tool result message with `toolCallId="tc-1"` and content "result"

#### 2b. Pop at depth 2 injects into depth 1, not root

Stack: root → child → grandchild. Pop grandchild with output "gc-result". Verify:
- Child's messages gain the tool result
- Root's messages are unchanged

#### 2c. Pop with error status

Pop child with `status: 'error'` and output "something went wrong". Verify:
- The injected tool result contains the error output
- The tool result is still injected (parent can handle the error)

#### 2d. Sequential pops (grandchild then child)

Stack: root → child → grandchild. Pop grandchild with "gc-out". Then pop child with "child-out". Verify:
- After first pop: child messages have gc tool result, root unchanged
- After second pop: root messages have child tool result
- Final stack is empty

### 3. Active Level and Routing Tests

#### 3a. Active depth tracking

Empty stack: `getActiveDepth` returns 0. Push child: returns 1. Push grandchild: returns 2. Pop: returns 1. Pop: returns 0.

#### 3b. User message routes to active depth

Stack has one child. `appendUserMessage` appends to child's messages, not root's. Root messages unchanged.

#### 3c. User message routes to root when stack empty

Empty stack. `appendUserMessage` appends to root messages.

### 4. Request Payload Tests

#### 4a. No composition payload when stack empty

`buildCompositionPayload` returns `undefined` when stack is empty.

#### 4b. Depth-1 payload

Push one child. `buildCompositionPayload` returns:
- `depth: 1`
- `stack` array with one entry containing the root's `parentMessages`, `parentToolCallId`, `appType`

#### 4c. Depth-2 payload

Push child then grandchild. `buildCompositionPayload` returns:
- `depth: 2`
- `stack` array with two entries (root's state, then child's state)
- `parentMessages` at each level are the messages from that level at time of dispatch (opaque, verbatim)

### 5. Token Tracking Tests

#### 5a. Per-depth token accumulation

Track tokens at depth 0 (100 input), depth 1 (200 input), depth 2 (50 input). Verify per-depth totals and aggregate total (350).

## Test Location

All tests in: `packages/web/app/hooks/__tests__/useCompositionStack.test.ts`

Module under test: `packages/web/app/hooks/useCompositionStack.ts`

Test runner: Jest with ESM (`npm run test -w packages/web` — or if web package uses vitest, adapt accordingly).

## What Part 2 Covers

Part 2 implements:
- `useCompositionStack.ts` — the pure functions that satisfy these tests
- Backend changes: `simulationOrchestrator.ts`, `simulateChildResolver.ts`, SSE event types with `depth`
- Frontend wiring: `useSimulation.ts` integration, `SimulationPanel.tsx` breadcrumbs, `agentSimulationApi.ts` composition payload
- Backend handler changes: `simulateAgentHandler.ts` delegation to orchestrator
