import { describe, expect, it } from '@jest/globals';

import {
  type CompositionLevel,
  appendUserMessage,
  buildCompositionPayload,
  getActiveDepth,
  getActiveMessages,
  popChild,
  pushChild,
} from '../useCompositionStack';
import {
  defaultPushParams,
  makeToolCallMessage,
  makeUserMessage,
} from './compositionStack.helpers';

describe('Active Level and Routing', () => {
  it('3a: active depth tracking across push and pop', () => {
    const rootMessages = [makeUserMessage('root')];

    expect(getActiveDepth([])).toBe(0);

    const stack1 = pushChild([], defaultPushParams({ parentMessages: rootMessages }));
    expect(getActiveDepth(stack1)).toBe(1);

    const childMsgs = getActiveMessages(stack1, rootMessages);
    const stack2 = pushChild(
      stack1,
      defaultPushParams({ task: 'grandchild', parentMessages: childMsgs })
    );
    expect(getActiveDepth(stack2)).toBe(2);

    const pop1 = popChild(stack2, rootMessages, 'gc-done', 'success');
    expect(getActiveDepth(pop1.stack)).toBe(1);
    const childAfterPop = getActiveMessages(pop1.stack, pop1.rootMessages);
    expect(childAfterPop.length).toBeGreaterThan(childMsgs.length);

    const pop2 = popChild(pop1.stack, pop1.rootMessages, 'child-done', 'success');
    expect(getActiveDepth(pop2.stack)).toBe(0);
    expect(pop2.rootMessages.length).toBeGreaterThan(rootMessages.length);
  });

  it('3b: user message routes to active depth', () => {
    const rootMessages = [makeUserMessage('root')];
    const stack = pushChild(
      [],
      defaultPushParams({ task: 'child task', parentMessages: rootMessages })
    );

    const result = appendUserMessage(stack, rootMessages, 'user reply');

    expect(result.rootMessages).toHaveLength(1);

    const childMsgs = getActiveMessages(result.stack, result.rootMessages);
    expect(childMsgs).toHaveLength(2);
  });

  it('3c: user message routes to root when stack empty', () => {
    const rootMessages = [makeUserMessage('root')];

    const result = appendUserMessage([], rootMessages, 'another message');

    expect(result.rootMessages).toHaveLength(2);
    expect(result.stack).toHaveLength(0);
  });

  it('3d: user message routes to depth 2', () => {
    const rootMessages = [makeUserMessage('root')];
    const stack1 = pushChild([], defaultPushParams({ parentMessages: rootMessages }));
    const childMsgs = getActiveMessages(stack1, rootMessages);

    const stack2 = pushChild(
      stack1,
      defaultPushParams({ task: 'grandchild', parentMessages: childMsgs })
    );

    const result = appendUserMessage(stack2, rootMessages, 'msg to grandchild');

    expect(result.rootMessages).toHaveLength(1);

    const childAfter = getActiveMessages(
      result.stack.slice(0, 1) as CompositionLevel[],
      result.rootMessages
    );
    expect(childAfter).toHaveLength(1);

    const grandchildMsgs = getActiveMessages(result.stack, result.rootMessages);
    expect(grandchildMsgs).toHaveLength(2);
  });
});

describe('Request Payload', () => {
  it('4a: no composition payload when stack empty', () => {
    expect(buildCompositionPayload([])).toBeUndefined();
  });

  it('4b: depth-1 payload', () => {
    const rootMessages = [makeUserMessage('hello'), makeToolCallMessage('tc-1')];
    const stack = pushChild(
      [],
      defaultPushParams({
        parentToolCallId: 'tc-1',
        parentMessages: rootMessages,
      })
    );

    const payload = buildCompositionPayload(stack);

    expect(payload).toBeDefined();
    expect(payload!.depth).toBe(1);
    expect(payload!.stack).toHaveLength(1);
    expect(payload!.stack[0]!.parentToolCallId).toBe('tc-1');
    expect(payload!.stack[0]!.appType).toBe('agent');
    expect(payload!.stack[0]!.parentMessages).toEqual(rootMessages);
  });

  it('4c: depth-2 payload', () => {
    const rootMessages = [makeUserMessage('hello'), makeToolCallMessage('tc-1')];
    const stack1 = pushChild(
      [],
      defaultPushParams({
        parentToolCallId: 'tc-1',
        parentMessages: rootMessages,
      })
    );

    const childMsgs = getActiveMessages(stack1, rootMessages);
    const childWithTc = [...childMsgs, makeToolCallMessage('tc-2')];
    const updatedStack = stack1.map((level) => ({
      ...level,
      messages: childWithTc,
    }));

    const stack2 = pushChild(
      updatedStack,
      defaultPushParams({
        parentToolCallId: 'tc-2',
        task: 'grandchild',
        parentMessages: childWithTc,
      })
    );

    const payload = buildCompositionPayload(stack2);

    expect(payload).toBeDefined();
    expect(payload!.depth).toBe(2);
    expect(payload!.stack).toHaveLength(2);

    expect(payload!.stack[0]!.parentToolCallId).toBe('tc-1');
    expect(payload!.stack[0]!.parentMessages).toEqual(rootMessages);

    expect(payload!.stack[1]!.parentToolCallId).toBe('tc-2');
    expect(payload!.stack[1]!.parentMessages).toEqual(childWithTc);
  });
});
