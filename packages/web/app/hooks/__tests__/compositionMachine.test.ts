import { describe, expect, it } from '@jest/globals';

import type { SimChildDispatchedEvent } from '../../lib/sseSimComposition';
import { type CompositionState, INITIAL_STATE, transition } from '../compositionMachine';
import {
  getTextFromMessage,
  getToolResultFromMessage,
  makeToolCallMessage,
  makeUserMessage,
} from './compositionStack.helpers';

function makeDispatchedEvent(overrides?: Partial<SimChildDispatchedEvent>): SimChildDispatchedEvent {
  return {
    depth: 1,
    parentDepth: 0,
    dispatchType: 'agent',
    task: 'child task',
    parentToolCallId: 'tc-1',
    toolName: 'invoke_agent',
    ...overrides,
  };
}

describe('compositionMachine – transition', () => {
  it('RESET returns INITIAL_STATE', () => {
    const dirty: CompositionState = {
      ...INITIAL_STATE,
      phase: 'running',
      rootMessages: [makeUserMessage('hi')],
    };
    const next = transition(dirty, { type: 'RESET' });
    expect(next).toEqual(INITIAL_STATE);
  });

  it('START sets rootMessages and phase=running', () => {
    const msgs = [makeUserMessage('hello')];
    const next = transition(INITIAL_STATE, { type: 'START', rootMessages: msgs });
    expect(next.rootMessages).toBe(msgs);
    expect(next.phase).toBe('running');
    expect(next.stack).toHaveLength(0);
  });

  it('CHILD_DISPATCHED pushes stack entry and sets phase/pendingDispatch', () => {
    const parentMsgs = [makeUserMessage('u1'), makeToolCallMessage('tc-1')];
    const running: CompositionState = { ...INITIAL_STATE, phase: 'running', rootMessages: parentMsgs };
    const event = makeDispatchedEvent();

    const next = transition(running, {
      type: 'CHILD_DISPATCHED',
      event,
      parentMessages: parentMsgs,
      parentCurrentNode: 'test-node',
    });

    expect(next.stack).toHaveLength(1);
    expect(next.phase).toBe('child_dispatched');
    expect(next.pendingDispatch).not.toBeNull();
    expect(next.pendingDispatch?.task).toBe('child task');
    expect(next.pendingDispatch?.label).toBe('invoke_agent');
    expect(next.stack[0]?.parentToolCallId).toBe('tc-1');
  });

  it('CHILD_DISPATCHED with childConfig stores it', () => {
    const parentMsgs = [makeToolCallMessage('tc-1')];
    const running: CompositionState = { ...INITIAL_STATE, phase: 'running', rootMessages: parentMsgs };
    const childConfig = {
      systemPrompt: 'You are a helper',
      context: 'ctx',
      modelId: 'gpt-4',
      maxSteps: 5,
    };
    const event = makeDispatchedEvent({ childConfig });

    const next = transition(running, {
      type: 'CHILD_DISPATCHED',
      event,
      parentMessages: parentMsgs,
      parentCurrentNode: 'test-node',
    });

    expect(next.childConfig).toEqual(childConfig);
    expect(next.stack[0]?.childConfig).toEqual(childConfig);
  });

  it('CHILD_AUTO_SENT clears pendingDispatch and sets phase=child_running', () => {
    const state: CompositionState = {
      ...INITIAL_STATE,
      phase: 'child_dispatched',
      pendingDispatch: { task: 'child task', label: 'invoke_agent' },
    };

    const next = transition(state, { type: 'CHILD_AUTO_SENT' });
    expect(next.phase).toBe('child_running');
    expect(next.pendingDispatch).toBeNull();
  });

  it('USER_MESSAGE when child active appends to child messages, root unchanged', () => {
    const rootMsgs = [makeUserMessage('root')];
    const parentMsgs = [makeToolCallMessage('tc-1')];
    const running: CompositionState = { ...INITIAL_STATE, phase: 'running', rootMessages: rootMsgs };
    const dispatched = transition(running, {
      type: 'CHILD_DISPATCHED',
      event: makeDispatchedEvent(),
      parentMessages: parentMsgs,
      parentCurrentNode: 'test-node',
    });

    const next = transition(dispatched, { type: 'USER_MESSAGE', text: 'hello child' });

    expect(next.rootMessages).toHaveLength(1);
    const childMsgs = next.stack[0]?.messages;
    expect(childMsgs).toBeDefined();
    // 1 task message (from push) + 1 user message
    expect(childMsgs).toHaveLength(2);
    const lastMsg = childMsgs?.[childMsgs.length - 1];
    expect(lastMsg).toBeDefined();
    expect(getTextFromMessage(lastMsg!)).toBe('hello child');
  });

  it('USER_MESSAGE when no child appends to root', () => {
    const rootMsgs = [makeUserMessage('root')];
    const state: CompositionState = { ...INITIAL_STATE, phase: 'running', rootMessages: rootMsgs };

    const next = transition(state, { type: 'USER_MESSAGE', text: 'follow up' });

    expect(next.rootMessages).toHaveLength(2);
    expect(next.stack).toHaveLength(0);
    const lastRoot = next.rootMessages[next.rootMessages.length - 1];
    expect(lastRoot).toBeDefined();
    expect(getTextFromMessage(lastRoot!)).toBe('follow up');
  });

  it('CHILD_RESPONSE appends assistant message to active child stack', () => {
    const rootMsgs = [makeUserMessage('root')];
    const parentMsgs = [makeToolCallMessage('tc-1')];
    const running: CompositionState = { ...INITIAL_STATE, phase: 'running', rootMessages: rootMsgs };
    const dispatched = transition(running, {
      type: 'CHILD_DISPATCHED',
      event: makeDispatchedEvent(),
      parentMessages: parentMsgs,
      parentCurrentNode: 'test-node',
    });
    const childRunning = transition(dispatched, { type: 'CHILD_AUTO_SENT' });

    const next = transition(childRunning, { type: 'CHILD_RESPONSE', text: 'I am the child response' });

    const childMsgs = next.stack[0]?.messages;
    expect(childMsgs).toBeDefined();
    // 1 task message + 1 assistant response
    expect(childMsgs).toHaveLength(2);
    const lastMsg = childMsgs?.[childMsgs.length - 1];
    expect(lastMsg?.message.role).toBe('assistant');
  });

  it('CHILD_FINISHED pops stack and injects tool result, phase=resuming_parent', () => {
    const rootMsgs = [makeUserMessage('root'), makeToolCallMessage('tc-1')];
    const running: CompositionState = { ...INITIAL_STATE, phase: 'running', rootMessages: rootMsgs };
    const dispatched = transition(running, {
      type: 'CHILD_DISPATCHED',
      event: makeDispatchedEvent(),
      parentMessages: rootMsgs,
      parentCurrentNode: 'test-node',
    });
    const childRunning = transition(dispatched, { type: 'CHILD_AUTO_SENT' });

    const next = transition(childRunning, {
      type: 'CHILD_FINISHED',
      output: 'child result',
      status: 'success',
    });

    expect(next.stack).toHaveLength(0);
    expect(next.phase).toBe('resuming_parent');
    expect(next.childConfig).toBeNull();

    // Root should have tool result appended
    const lastRoot = next.rootMessages[next.rootMessages.length - 1];
    expect(lastRoot).toBeDefined();
    const toolResult = getToolResultFromMessage(lastRoot!);
    expect(toolResult).not.toBeNull();
    expect(toolResult?.toolCallId).toBe('tc-1');
    expect(toolResult?.value).toBe('child result');
  });

  it('PARENT_RESUMED sets phase=running', () => {
    const state: CompositionState = { ...INITIAL_STATE, phase: 'resuming_parent' };
    const next = transition(state, { type: 'PARENT_RESUMED' });
    expect(next.phase).toBe('running');
  });

  it('STREAM_COMPLETED keeps child_running phase if child is active', () => {
    const state: CompositionState = { ...INITIAL_STATE, phase: 'child_running' };
    const next = transition(state, { type: 'STREAM_COMPLETED' });
    expect(next.phase).toBe('child_running');
  });

  it('STREAM_COMPLETED keeps running phase', () => {
    const state: CompositionState = { ...INITIAL_STATE, phase: 'running' };
    const next = transition(state, { type: 'STREAM_COMPLETED' });
    expect(next.phase).toBe('running');
  });

  describe('full lifecycle', () => {
    it('START → CHILD_DISPATCHED → AUTO_SENT → RESPONSE → USER_MSG → FINISHED → RESUMED', () => {
      const rootMsgs = [makeUserMessage('hello'), makeToolCallMessage('tc-1')];

      // 1. START
      let state = transition(INITIAL_STATE, { type: 'START', rootMessages: rootMsgs });
      expect(state.phase).toBe('running');

      // 2. CHILD_DISPATCHED
      state = transition(state, {
        type: 'CHILD_DISPATCHED',
        event: makeDispatchedEvent(),
        parentMessages: rootMsgs,
        parentCurrentNode: 'test-node',
      });
      expect(state.phase).toBe('child_dispatched');
      expect(state.stack).toHaveLength(1);

      // 3. CHILD_AUTO_SENT
      state = transition(state, { type: 'CHILD_AUTO_SENT' });
      expect(state.phase).toBe('child_running');
      expect(state.pendingDispatch).toBeNull();

      // 4. CHILD_RESPONSE
      state = transition(state, { type: 'CHILD_RESPONSE', text: 'child says hi' });
      expect(state.stack[0]?.messages).toHaveLength(2);

      // 5. USER_MESSAGE (to child)
      state = transition(state, { type: 'USER_MESSAGE', text: 'user replies to child' });
      expect(state.stack[0]?.messages).toHaveLength(3);
      expect(state.rootMessages).toHaveLength(2); // root unchanged

      // 6. CHILD_FINISHED
      state = transition(state, {
        type: 'CHILD_FINISHED',
        output: 'final output',
        status: 'success',
      });
      expect(state.phase).toBe('resuming_parent');
      expect(state.stack).toHaveLength(0);
      expect(state.rootMessages).toHaveLength(3); // original 2 + tool result

      // 7. PARENT_RESUMED
      state = transition(state, { type: 'PARENT_RESUMED' });
      expect(state.phase).toBe('running');
    });
  });
});
