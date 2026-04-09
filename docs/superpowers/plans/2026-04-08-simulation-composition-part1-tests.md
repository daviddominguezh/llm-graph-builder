# Simulation Composition Part 1: TDD Contract Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write the complete test suite for `useCompositionStack.ts` — pure functions that manage the composition stack for simulation agent/workflow nesting. Tests are the behavioral contract; no implementation code in this plan.

**Architecture:** Pure functions operate on a `CompositionLevel[]` stack. Push adds a child level with isolated messages and snapshots the parent's messages at dispatch time. Pop removes the top child and injects its output as a tool result into the parent's messages. All functions are immutable (return new state, never mutate input). Tests import from the module but the module will only export stubs (type-correct but throwing) so tests can compile but fail.

**Tech Stack:** Jest (ESM), TypeScript, ts-jest

**Spec:** `docs/superpowers/specs/2026-04-08-simulation-composition-part1-tests.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `packages/web/jest.config.js` | Jest configuration for web package |
| `packages/web/tsconfig.test.json` | Separate tsconfig for Jest (uses NodeNext resolution instead of bundler) |
| `packages/web/app/hooks/useCompositionStack.ts` | Stub module — exports types and function signatures that throw `'not implemented'`. Enough for tests to compile and fail. |
| `packages/web/app/hooks/__tests__/useCompositionStack.test.ts` | Full test suite — 20 test cases across 5 groups |

---

### Task 1: Set up Jest in the web package

**Files:**
- Create: `packages/web/jest.config.js`
- Create: `packages/web/tsconfig.test.json`
- Modify: `packages/web/package.json`

- [ ] **Step 1: Create tsconfig.test.json**

The web package uses `moduleResolution: "bundler"` which doesn't work with ts-jest. Create a separate tsconfig for tests that uses `NodeNext`:

Create `packages/web/tsconfig.test.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

- [ ] **Step 2: Create jest.config.js**

Create `packages/web/jest.config.js`:

```javascript
/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/$1',
    '^@daviddh/llm-graph-runner$': '<rootDir>/../api/src/index.ts',
    '^@daviddh/graph-types$': '<rootDir>/../graph-types/src/index.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.test.json' }],
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
};
```

- [ ] **Step 3: Add test script to package.json**

In `packages/web/package.json`, add to the `"scripts"` section:

```json
"test": "NODE_OPTIONS='--experimental-vm-modules' npx jest"
```

- [ ] **Step 4: Install jest and ts-jest as dev dependencies**

Run: `npm install -D jest ts-jest @jest/globals -w packages/web`

- [ ] **Step 5: Verify jest runs (no tests yet)**

Run: `npm run test -w packages/web -- --passWithNoTests`
Expected: `No tests found` or similar with exit code 0.

- [ ] **Step 6: Commit**

```bash
git add packages/web/jest.config.js packages/web/tsconfig.test.json packages/web/package.json
git commit -m "chore: set up Jest in web package with NodeNext resolution for tests"
```

---

### Task 2: Create stub module with types

**Files:**
- Create: `packages/web/app/hooks/useCompositionStack.ts`

The stub exports the types and function signatures. Every function throws `'not implemented'` so tests can compile but fail at runtime. Note: `pushChild` receives `parentMessages` to snapshot the parent's state at dispatch time.

- [ ] **Step 1: Create the stub module**

Create `packages/web/app/hooks/useCompositionStack.ts`:

```typescript
import type { Message } from '@daviddh/llm-graph-runner';

/* ─── Types ─── */

export interface CompositionLevel {
  appType: 'agent' | 'workflow';
  messages: Message[];
  parentMessages: Message[];
  currentNodeId?: string;
  structuredOutputs?: Record<string, unknown[]>;
  dispatchParams: Record<string, unknown>;
  parentToolCallId: string;
  toolName: string;
}

export interface SimulationComposition {
  depth: number;
  stack: Array<{
    appType: 'agent' | 'workflow';
    parentToolCallId: string;
    parentMessages: Message[];
    parentCurrentNodeId?: string;
    parentStructuredOutputs?: Record<string, unknown[]>;
  }>;
}

export interface PushChildParams {
  appType: 'agent' | 'workflow';
  dispatchParams: Record<string, unknown>;
  parentToolCallId: string;
  toolName: string;
  task: string;
  parentMessages: Message[];
}

export interface PopChildResult {
  stack: CompositionLevel[];
  rootMessages: Message[];
}

export interface AppendMessageResult {
  stack: CompositionLevel[];
  rootMessages: Message[];
}

export interface DepthTokens {
  byDepth: Record<number, TokenTotals>;
  aggregate: TokenTotals;
}

export interface TokenTotals {
  input: number;
  output: number;
  cached: number;
}

/* ─── Stubs (tests compile, but fail at runtime) ─── */

export function pushChild(_stack: CompositionLevel[], _params: PushChildParams): CompositionLevel[] {
  throw new Error('not implemented');
}

export function popChild(
  _stack: CompositionLevel[],
  _rootMessages: Message[],
  _childOutput: string,
  _childStatus: 'success' | 'error'
): PopChildResult {
  throw new Error('not implemented');
}

export function getActiveDepth(_stack: CompositionLevel[]): number {
  throw new Error('not implemented');
}

export function getActiveMessages(_stack: CompositionLevel[], _rootMessages: Message[]): Message[] {
  throw new Error('not implemented');
}

export function appendUserMessage(
  _stack: CompositionLevel[],
  _rootMessages: Message[],
  _text: string
): AppendMessageResult {
  throw new Error('not implemented');
}

export function buildCompositionPayload(
  _stack: CompositionLevel[]
): SimulationComposition | undefined {
  throw new Error('not implemented');
}

export function accumulateDepthTokens(
  _current: DepthTokens,
  _depth: number,
  _tokens: TokenTotals
): DepthTokens {
  throw new Error('not implemented');
}

export function createEmptyDepthTokens(): DepthTokens {
  throw new Error('not implemented');
}
```

Key design decisions vs. original stub:
- `pushChild` now takes `parentMessages: Message[]` in params — snapshots parent state at dispatch time
- `CompositionLevel` now stores `parentMessages` and `toolName` (for tool result injection)
- `buildCompositionPayload` takes only `stack` (no `rootMessages`) — parent messages are already stored in each level

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/hooks/useCompositionStack.ts
git commit -m "feat: add useCompositionStack stub module with types and throwing functions"
```

---

### Task 3: Write state preservation tests (1a–1f)

**Files:**
- Create: `packages/web/app/hooks/__tests__/useCompositionStack.test.ts`

- [ ] **Step 1: Create the test file with helpers and state preservation tests**

Create `packages/web/app/hooks/__tests__/useCompositionStack.test.ts`:

```typescript
import { describe, expect, it } from '@jest/globals';
import { MESSAGES_PROVIDER, type Message } from '@daviddh/llm-graph-runner';

import {
  type CompositionLevel,
  type PushChildParams,
  accumulateDepthTokens,
  appendUserMessage,
  buildCompositionPayload,
  createEmptyDepthTokens,
  getActiveDepth,
  getActiveMessages,
  popChild,
  pushChild,
} from '../useCompositionStack';

/* ─── Test helpers ─── */

const ZERO = 0;

function makeUserMessage(text: string, id?: string): Message {
  const msgId = id ?? `msg-${text}`;
  return {
    id: msgId,
    provider: MESSAGES_PROVIDER.WEB,
    type: 'text',
    timestamp: Date.now(),
    originalId: msgId,
    message: { role: 'user' as const, content: [{ type: 'text' as const, text }] },
  } as Message;
}

function makeAssistantMessage(text: string, id?: string): Message {
  const msgId = id ?? `msg-${text}`;
  return {
    id: msgId,
    provider: MESSAGES_PROVIDER.WEB,
    type: 'text',
    timestamp: Date.now(),
    originalId: msgId,
    message: { role: 'assistant' as const, content: [{ type: 'text' as const, text }] },
  } as Message;
}

function makeToolCallMessage(toolCallId: string, toolName = 'invoke_agent'): Message {
  return {
    id: `msg-tc-${toolCallId}`,
    provider: MESSAGES_PROVIDER.WEB,
    type: 'text',
    timestamp: Date.now(),
    originalId: `msg-tc-${toolCallId}`,
    message: {
      role: 'assistant' as const,
      content: [{ type: 'tool-call' as const, toolCallId, toolName, input: {} }],
    },
  } as Message;
}

function defaultPushParams(overrides?: Partial<PushChildParams>): PushChildParams {
  return {
    appType: 'agent',
    dispatchParams: { agentSlug: 'child-agent', version: 'latest' },
    parentToolCallId: overrides?.parentToolCallId ?? 'tc-1',
    toolName: overrides?.toolName ?? 'invoke_agent',
    task: overrides?.task ?? 'Do something',
    parentMessages: overrides?.parentMessages ?? [],
  };
}

function getTextFromMessage(msg: Message): string {
  const content = (msg.message as { content: Array<{ text?: string }> }).content;
  return content[ZERO]?.text ?? '';
}

function getToolResultFromMessage(msg: Message): {
  toolCallId: string;
  toolName: string;
  value: string;
} | null {
  const role = (msg.message as { role: string }).role;
  if (role !== 'tool') return null;
  const content = (msg.message as { content: Array<Record<string, unknown>> }).content;
  const part = content[ZERO];
  if (part?.type !== 'tool-result') return null;
  const output = part.output as { type: string; value: string } | undefined;
  return {
    toolCallId: String(part.toolCallId ?? ''),
    toolName: String(part.toolName ?? ''),
    value: output?.value ?? '',
  };
}

/* ─── 1. State Preservation Tests ─── */

describe('State Preservation', () => {
  describe('1a: Message history isolation on push', () => {
    it('child has only the task as a user message', () => {
      const rootMessages = [makeUserMessage('hello'), makeAssistantMessage('hi')];
      const stack = pushChild([], defaultPushParams({
        task: 'child task',
        parentMessages: rootMessages,
      }));

      expect(stack).toHaveLength(1);
      const child = stack[ZERO]!;
      expect(child.messages).toHaveLength(1);
      expect(getTextFromMessage(child.messages[ZERO]!)).toBe('child task');
    });

    it('child messages are a new array instance, not shared with parent', () => {
      const rootMessages = [makeUserMessage('hello')];
      const stack = pushChild([], defaultPushParams({ parentMessages: rootMessages }));
      expect(stack[ZERO]!.messages).not.toBe(rootMessages);
    });
  });

  describe('1b: Message history isolation at depth 2', () => {
    it('each depth has independent messages', () => {
      const rootMessages = [makeUserMessage('root')];
      const stack1 = pushChild([], defaultPushParams({
        task: 'child task',
        parentMessages: rootMessages,
      }));
      const stack2 = pushChild(stack1, defaultPushParams({
        task: 'grandchild task',
        parentToolCallId: 'tc-2',
        parentMessages: stack1[ZERO]!.messages,
      }));

      expect(stack2).toHaveLength(2);
      const child = stack2[ZERO]!;
      const grandchild = stack2[1]!;

      expect(child.messages).toHaveLength(1);
      expect(getTextFromMessage(child.messages[ZERO]!)).toBe('child task');

      expect(grandchild.messages).toHaveLength(1);
      expect(getTextFromMessage(grandchild.messages[ZERO]!)).toBe('grandchild task');

      expect(child.messages).not.toBe(grandchild.messages);
      expect(child.messages).not.toBe(rootMessages);
    });
  });

  describe('1c: Parent messages preserved after child finishes', () => {
    it('root messages get tool result appended, originals preserved by reference', () => {
      const msg1 = makeUserMessage('u1');
      const msg2 = makeAssistantMessage('a1');
      const msg3 = makeUserMessage('u2');
      const msg4 = makeToolCallMessage('tc-1', 'invoke_agent');
      const rootMessages = [msg1, msg2, msg3, msg4];

      const stack = pushChild([], defaultPushParams({
        parentToolCallId: 'tc-1',
        toolName: 'invoke_agent',
        parentMessages: rootMessages,
      }));
      const result = popChild(stack, rootMessages, 'done', 'success');

      expect(result.rootMessages).toHaveLength(5);
      // Original 4 messages preserved (referential equality)
      expect(result.rootMessages[ZERO]).toBe(msg1);
      expect(result.rootMessages[1]).toBe(msg2);
      expect(result.rootMessages[2]).toBe(msg3);
      expect(result.rootMessages[3]).toBe(msg4);

      // 5th message is a tool result with correct AI SDK format
      const toolResult = getToolResultFromMessage(result.rootMessages[4]!);
      expect(toolResult).not.toBeNull();
      expect(toolResult!.toolCallId).toBe('tc-1');
      expect(toolResult!.toolName).toBe('invoke_agent');
      expect(toolResult!.value).toBe('done');
    });
  });

  describe('1d: Multi-turn child preserves parent state across appends', () => {
    it('appending to child does not affect root messages', () => {
      const rootMessages = [
        makeUserMessage('r1'),
        makeAssistantMessage('r2'),
        makeUserMessage('r3'),
        makeAssistantMessage('r4'),
      ];

      const stack = pushChild([], defaultPushParams({
        task: 'child task',
        parentMessages: rootMessages,
      }));
      const after1 = appendUserMessage(stack, rootMessages, 'hello');
      const after2 = appendUserMessage(after1.stack, after1.rootMessages, 'world');

      expect(after2.rootMessages).toHaveLength(4);
      const childMessages = getActiveMessages(after2.stack, after2.rootMessages);
      expect(childMessages).toHaveLength(3);
    });
  });

  describe('1e: Workflow parent state preservation', () => {
    it('parentMessages snapshot is stored in the composition level', () => {
      const rootMessages = [makeUserMessage('r1'), makeToolCallMessage('tc-1')];
      const stack = pushChild([], {
        appType: 'workflow',
        dispatchParams: {},
        parentToolCallId: 'tc-1',
        toolName: 'invoke_workflow',
        task: 'child task',
        parentMessages: rootMessages,
      });

      // The pushed level stores the parent's messages at dispatch time
      expect(stack[ZERO]!.parentMessages).toEqual(rootMessages);
      expect(stack[ZERO]!.parentMessages).not.toBe(rootMessages); // snapshot, not reference
    });
  });

  describe('1f: Composition stack round-trip fidelity', () => {
    it('serialized and deserialized stack produces identical behavior', () => {
      const rootMessages = [makeUserMessage('root')];
      const stack1 = pushChild([], defaultPushParams({
        task: 'child',
        parentMessages: rootMessages,
      }));
      const stack2 = pushChild(stack1, defaultPushParams({
        task: 'grandchild',
        parentToolCallId: 'tc-2',
        parentMessages: stack1[ZERO]!.messages,
      }));

      const serialized = JSON.stringify(stack2);
      const deserialized = JSON.parse(serialized) as CompositionLevel[];

      expect(getActiveDepth(deserialized)).toBe(2);
      const activeMessages = getActiveMessages(deserialized, []);
      expect(activeMessages).toHaveLength(1);
      expect(getTextFromMessage(activeMessages[ZERO]!)).toBe('grandchild');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/web -- --testPathPattern=useCompositionStack`
Expected: All tests FAIL with `Error: not implemented`

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/hooks/__tests__/useCompositionStack.test.ts
git commit -m "test: add state preservation tests for composition stack (red)"
```

---

### Task 4: Write pop and inject tests (2a–2d)

**Files:**
- Modify: `packages/web/app/hooks/__tests__/useCompositionStack.test.ts`

- [ ] **Step 1: Add pop and inject tests**

Append to the test file, after the `State Preservation` describe block:

```typescript
/* ─── 2. Pop and Inject Tests ─── */

describe('Pop and Inject', () => {
  describe('2a: Pop injects tool result at root level', () => {
    it('adds tool result with correct toolCallId, toolName, and AI SDK format', () => {
      const rootMessages = [makeUserMessage('u1'), makeToolCallMessage('tc-1', 'invoke_agent')];
      const stack = pushChild([], defaultPushParams({
        parentToolCallId: 'tc-1',
        toolName: 'invoke_agent',
        parentMessages: rootMessages,
      }));

      const result = popChild(stack, rootMessages, 'result-text', 'success');

      expect(result.stack).toHaveLength(ZERO);
      expect(result.rootMessages).toHaveLength(3);

      const toolResult = getToolResultFromMessage(result.rootMessages[2]!);
      expect(toolResult).not.toBeNull();
      expect(toolResult!.toolCallId).toBe('tc-1');
      expect(toolResult!.toolName).toBe('invoke_agent');
      expect(toolResult!.value).toBe('result-text');

      // Verify the role is 'tool'
      expect((result.rootMessages[2]!.message as { role: string }).role).toBe('tool');
    });
  });

  describe('2b: Pop at depth 2 injects into depth 1, not root', () => {
    it('grandchild output goes to child messages, root untouched', () => {
      const rootMessages = [makeUserMessage('root'), makeToolCallMessage('tc-1')];
      const stack1 = pushChild([], defaultPushParams({
        parentToolCallId: 'tc-1',
        parentMessages: rootMessages,
      }));

      // Simulate child doing a tool call that dispatches grandchild
      const childWithToolCall: CompositionLevel = {
        ...stack1[ZERO]!,
        messages: [...stack1[ZERO]!.messages, makeToolCallMessage('tc-2') as Message],
      };
      const stack2 = pushChild([childWithToolCall], defaultPushParams({
        task: 'gc task',
        parentToolCallId: 'tc-2',
        parentMessages: childWithToolCall.messages,
      }));

      const result = popChild(stack2, rootMessages, 'gc-result', 'success');

      expect(result.stack).toHaveLength(1);
      expect(result.rootMessages).toHaveLength(2); // root unchanged
      // Child messages gained the tool result
      const childMsgCount = result.stack[ZERO]!.messages.length;
      expect(childMsgCount).toBe(childWithToolCall.messages.length + 1);

      // Verify the injected tool result
      const lastChildMsg = result.stack[ZERO]!.messages[childMsgCount - 1]!;
      const toolResult = getToolResultFromMessage(lastChildMsg);
      expect(toolResult).not.toBeNull();
      expect(toolResult!.value).toBe('gc-result');
    });
  });

  describe('2c: Pop with error status', () => {
    it('injects error output as tool result', () => {
      const rootMessages = [makeToolCallMessage('tc-1', 'invoke_agent')];
      const stack = pushChild([], defaultPushParams({
        parentToolCallId: 'tc-1',
        toolName: 'invoke_agent',
        parentMessages: rootMessages,
      }));

      const result = popChild(stack, rootMessages, 'something went wrong', 'error');

      expect(result.rootMessages).toHaveLength(2);
      const toolResult = getToolResultFromMessage(result.rootMessages[1]!);
      expect(toolResult).not.toBeNull();
      expect(toolResult!.value).toBe('something went wrong');
    });
  });

  describe('2d: Sequential pops (grandchild then child)', () => {
    it('unwinds correctly through two levels', () => {
      const rootMessages = [makeUserMessage('root'), makeToolCallMessage('tc-1', 'invoke_agent')];
      const stack1 = pushChild([], defaultPushParams({
        parentToolCallId: 'tc-1',
        toolName: 'invoke_agent',
        parentMessages: rootMessages,
      }));

      const childWithToolCall: CompositionLevel = {
        ...stack1[ZERO]!,
        messages: [...stack1[ZERO]!.messages, makeToolCallMessage('tc-2', 'invoke_agent') as Message],
      };
      const stack2 = pushChild([childWithToolCall], defaultPushParams({
        task: 'gc',
        parentToolCallId: 'tc-2',
        toolName: 'invoke_agent',
        parentMessages: childWithToolCall.messages,
      }));

      // Pop grandchild
      const afterGcPop = popChild(stack2, rootMessages, 'gc-out', 'success');
      expect(afterGcPop.stack).toHaveLength(1);
      expect(afterGcPop.rootMessages).toHaveLength(2); // root unchanged

      // Pop child
      const afterChildPop = popChild(afterGcPop.stack, afterGcPop.rootMessages, 'child-out', 'success');
      expect(afterChildPop.stack).toHaveLength(ZERO);
      expect(afterChildPop.rootMessages).toHaveLength(3); // root + child tool result

      // Verify the child's tool result was injected correctly
      const toolResult = getToolResultFromMessage(afterChildPop.rootMessages[2]!);
      expect(toolResult).not.toBeNull();
      expect(toolResult!.value).toBe('child-out');
    });
  });

  describe('2e: Pop from empty stack', () => {
    it('returns unchanged state', () => {
      const rootMessages = [makeUserMessage('root')];
      const result = popChild([], rootMessages, 'output', 'success');

      expect(result.stack).toHaveLength(ZERO);
      expect(result.rootMessages).toBe(rootMessages);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/web -- --testPathPattern=useCompositionStack`
Expected: New tests FAIL with `Error: not implemented`

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/hooks/__tests__/useCompositionStack.test.ts
git commit -m "test: add pop and inject tests for composition stack (red)"
```

---

### Task 5: Write active level, routing, and payload tests (3a–4c)

**Files:**
- Modify: `packages/web/app/hooks/__tests__/useCompositionStack.test.ts`

- [ ] **Step 1: Add active level, routing, and payload tests**

Append to the test file:

```typescript
/* ─── 3. Active Level and Routing Tests ─── */

describe('Active Level and Routing', () => {
  describe('3a: Active depth tracking', () => {
    it('tracks depth through push and pop operations', () => {
      expect(getActiveDepth([])).toBe(ZERO);

      const stack1 = pushChild([], defaultPushParams());
      expect(getActiveDepth(stack1)).toBe(1);

      const stack2 = pushChild(stack1, defaultPushParams({
        task: 'gc',
        parentToolCallId: 'tc-2',
        parentMessages: stack1[ZERO]!.messages,
      }));
      expect(getActiveDepth(stack2)).toBe(2);

      const afterPop1 = popChild(stack2, [], 'out', 'success');
      expect(getActiveDepth(afterPop1.stack)).toBe(1);
      // Verify child messages have tool result after pop
      expect(afterPop1.stack[ZERO]!.messages.length).toBeGreaterThan(1);

      const afterPop2 = popChild(afterPop1.stack, afterPop1.rootMessages, 'out', 'success');
      expect(getActiveDepth(afterPop2.stack)).toBe(ZERO);
      // Verify root messages have tool result after pop
      expect(afterPop2.rootMessages.length).toBeGreaterThan(ZERO);
    });
  });

  describe('3b: User message routes to active depth', () => {
    it('appends to child messages when child is active', () => {
      const rootMessages = [makeUserMessage('root')];
      const stack = pushChild([], defaultPushParams({
        task: 'child task',
        parentMessages: rootMessages,
      }));

      const result = appendUserMessage(stack, rootMessages, 'user reply');

      expect(result.rootMessages).toHaveLength(1); // root unchanged
      const childMessages = getActiveMessages(result.stack, result.rootMessages);
      expect(childMessages).toHaveLength(2); // task + reply
    });
  });

  describe('3c: User message routes to root when stack empty', () => {
    it('appends to root messages when no children', () => {
      const rootMessages = [makeUserMessage('root')];
      const result = appendUserMessage([], rootMessages, 'another message');

      expect(result.rootMessages).toHaveLength(2);
      expect(result.stack).toHaveLength(ZERO);
    });
  });

  describe('3d: User message routes to depth 2 when grandchild is active', () => {
    it('appends to grandchild messages, not child or root', () => {
      const rootMessages = [makeUserMessage('root')];
      const stack1 = pushChild([], defaultPushParams({
        task: 'child',
        parentMessages: rootMessages,
      }));
      const stack2 = pushChild(stack1, defaultPushParams({
        task: 'grandchild',
        parentToolCallId: 'tc-2',
        parentMessages: stack1[ZERO]!.messages,
      }));

      const result = appendUserMessage(stack2, rootMessages, 'msg to grandchild');

      expect(result.rootMessages).toHaveLength(1); // root unchanged
      expect(result.stack[ZERO]!.messages).toHaveLength(1); // child unchanged
      const gcMessages = getActiveMessages(result.stack, result.rootMessages);
      expect(gcMessages).toHaveLength(2); // grandchild task + user msg
    });
  });
});

/* ─── 4. Request Payload Tests ─── */

describe('Request Payload', () => {
  describe('4a: No composition payload when stack empty', () => {
    it('returns undefined for empty stack', () => {
      expect(buildCompositionPayload([])).toBeUndefined();
    });
  });

  describe('4b: Depth-1 payload', () => {
    it('returns correct composition with parent messages snapshot', () => {
      const rootMessages = [makeUserMessage('root'), makeToolCallMessage('tc-1')];
      const stack = pushChild([], defaultPushParams({
        parentToolCallId: 'tc-1',
        parentMessages: rootMessages,
      }));

      const payload = buildCompositionPayload(stack);

      expect(payload).toBeDefined();
      expect(payload!.depth).toBe(1);
      expect(payload!.stack).toHaveLength(1);
      expect(payload!.stack[ZERO]!.parentToolCallId).toBe('tc-1');
      expect(payload!.stack[ZERO]!.appType).toBe('agent');
      // parentMessages is the snapshot from push time
      expect(payload!.stack[ZERO]!.parentMessages).toEqual(rootMessages);
    });
  });

  describe('4c: Depth-2 payload', () => {
    it('returns correct composition with snapshots at each level', () => {
      const rootMessages = [makeUserMessage('root'), makeToolCallMessage('tc-1')];
      const stack1 = pushChild([], defaultPushParams({
        parentToolCallId: 'tc-1',
        parentMessages: rootMessages,
      }));
      const stack2 = pushChild(stack1, defaultPushParams({
        task: 'gc',
        parentToolCallId: 'tc-2',
        parentMessages: stack1[ZERO]!.messages,
      }));

      const payload = buildCompositionPayload(stack2);

      expect(payload).toBeDefined();
      expect(payload!.depth).toBe(2);
      expect(payload!.stack).toHaveLength(2);
      // First entry: root's state at dispatch time
      expect(payload!.stack[ZERO]!.parentToolCallId).toBe('tc-1');
      expect(payload!.stack[ZERO]!.parentMessages).toEqual(rootMessages);
      // Second entry: child's state at dispatch time
      expect(payload!.stack[1]!.parentToolCallId).toBe('tc-2');
      expect(payload!.stack[1]!.parentMessages).toEqual(stack1[ZERO]!.messages);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/web -- --testPathPattern=useCompositionStack`
Expected: All new tests FAIL with `Error: not implemented`

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/hooks/__tests__/useCompositionStack.test.ts
git commit -m "test: add active level, routing, and payload tests for composition stack (red)"
```

---

### Task 6: Write token tracking tests (5a)

**Files:**
- Modify: `packages/web/app/hooks/__tests__/useCompositionStack.test.ts`

- [ ] **Step 1: Add token tracking tests**

Append to the test file:

```typescript
/* ─── 5. Token Tracking Tests ─── */

describe('Token Tracking', () => {
  describe('5a: Per-depth token accumulation', () => {
    it('tracks per-depth and aggregate totals', () => {
      let tokens = createEmptyDepthTokens();

      tokens = accumulateDepthTokens(tokens, ZERO, { input: 100, output: 50, cached: 10 });
      tokens = accumulateDepthTokens(tokens, 1, { input: 200, output: 80, cached: 20 });
      tokens = accumulateDepthTokens(tokens, 2, { input: 50, output: 30, cached: 5 });

      expect(tokens.byDepth[ZERO]).toEqual({ input: 100, output: 50, cached: 10 });
      expect(tokens.byDepth[1]).toEqual({ input: 200, output: 80, cached: 20 });
      expect(tokens.byDepth[2]).toEqual({ input: 50, output: 30, cached: 5 });
      expect(tokens.aggregate).toEqual({ input: 350, output: 160, cached: 35 });
    });

    it('accumulates multiple calls at the same depth', () => {
      let tokens = createEmptyDepthTokens();

      tokens = accumulateDepthTokens(tokens, ZERO, { input: 50, output: 20, cached: 5 });
      tokens = accumulateDepthTokens(tokens, ZERO, { input: 50, output: 30, cached: 5 });

      expect(tokens.byDepth[ZERO]).toEqual({ input: 100, output: 50, cached: 10 });
      expect(tokens.aggregate).toEqual({ input: 100, output: 50, cached: 10 });
    });

    it('starts with zero totals', () => {
      const tokens = createEmptyDepthTokens();

      expect(tokens.aggregate).toEqual({ input: ZERO, output: ZERO, cached: ZERO });
      expect(Object.keys(tokens.byDepth)).toHaveLength(ZERO);
    });
  });
});
```

- [ ] **Step 2: Run full test suite to verify all tests fail**

Run: `npm run test -w packages/web -- --testPathPattern=useCompositionStack --verbose`
Expected: All 20 tests FAIL with `Error: not implemented`. No test passes.

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/hooks/__tests__/useCompositionStack.test.ts
git commit -m "test: add token tracking tests for composition stack (red) — full contract complete"
```

---

### Task 7: Verify the complete test suite

- [ ] **Step 1: Run the full suite and count failures**

Run: `npm run test -w packages/web -- --testPathPattern=useCompositionStack --verbose`
Expected: 20 test cases, all FAIL with `Error: not implemented`. No compilation errors.

- [ ] **Step 2: Verify test file typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

This completes Part 1. The test suite is the behavioral contract. Part 2 implements `useCompositionStack.ts` to make these tests pass.
