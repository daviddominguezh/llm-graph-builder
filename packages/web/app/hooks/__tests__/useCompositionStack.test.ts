import { describe, expect, it } from '@jest/globals';

import {
  type CompositionLevel,
  appendUserMessage,
  getActiveDepth,
  getActiveMessages,
  popChild,
  pushChild,
} from '../useCompositionStack';
import {
  defaultPushParams,
  getTextFromMessage,
  getToolResultFromMessage,
  makeAssistantMessage,
  makeToolCallMessage,
  makeUserMessage,
} from './compositionStack.helpers';

describe('State Preservation', () => {
  it('1a: message history isolation on push', () => {
    const rootMessages = [makeUserMessage('hello'), makeAssistantMessage('hi')];
    const stack = pushChild([], defaultPushParams({ parentMessages: rootMessages }));
    const childMessages = getActiveMessages(stack, rootMessages);

    expect(childMessages).toHaveLength(1);
    expect(getTextFromMessage(childMessages[0]!)).toContain('child task');
    expect(childMessages).not.toBe(rootMessages);
  });

  it('1b: message history isolation at depth 2', () => {
    const rootMsgs = [makeUserMessage('root')];
    const stack1 = pushChild([], defaultPushParams({ parentMessages: rootMsgs }));
    const childMsgs = getActiveMessages(stack1, rootMsgs);

    const stack2 = pushChild(
      stack1,
      defaultPushParams({ task: 'grandchild task', parentMessages: childMsgs })
    );

    const grandchildMsgs = getActiveMessages(stack2, rootMsgs);

    expect(rootMsgs).toHaveLength(1);
    expect(childMsgs).not.toBe(grandchildMsgs);
    expect(grandchildMsgs).not.toBe(rootMsgs);
    expect(getTextFromMessage(grandchildMsgs[0]!)).toContain('grandchild task');
  });

  it('1c: parent messages preserved after child finishes', () => {
    const user1 = makeUserMessage('u1', 'u1');
    const asst1 = makeAssistantMessage('a1', 'a1');
    const user2 = makeUserMessage('u2', 'u2');
    const tc1 = makeToolCallMessage('tc-1', 'invoke_agent');
    const rootMessages = [user1, asst1, user2, tc1];

    const stack = pushChild(
      [],
      defaultPushParams({
        parentToolCallId: 'tc-1',
        toolName: 'invoke_agent',
        parentMessages: rootMessages,
      })
    );

    const { rootMessages: updatedRoot } = popChild(stack, rootMessages, 'done', 'success');

    expect(updatedRoot).toHaveLength(5);
    expect(updatedRoot[0]).toBe(user1);
    expect(updatedRoot[1]).toBe(asst1);
    expect(updatedRoot[2]).toBe(user2);
    expect(updatedRoot[3]).toBe(tc1);

    const toolResult = getToolResultFromMessage(updatedRoot[4]!);
    expect(toolResult).not.toBeNull();
    expect(toolResult!.toolCallId).toBe('tc-1');
    expect(toolResult!.toolName).toBe('invoke_agent');
    expect(toolResult!.value).toBe('done');
  });

  it('1d: multi-turn child preserves parent state across appends', () => {
    const rootMessages = [
      makeUserMessage('r1'),
      makeAssistantMessage('r2'),
      makeUserMessage('r3'),
      makeToolCallMessage('tc-d'),
    ];
    const stack = pushChild([], defaultPushParams({ parentMessages: rootMessages }));

    const after1 = appendUserMessage(stack, rootMessages, 'hello');
    const after2 = appendUserMessage(after1.stack, after1.rootMessages, 'world');

    expect(after2.rootMessages).toHaveLength(4);

    const childMsgs = getActiveMessages(after2.stack, after2.rootMessages);
    expect(childMsgs).toHaveLength(3);
  });

  it('1e: workflow parent state preservation', () => {
    const parentMsgs = [makeUserMessage('parent'), makeAssistantMessage('reply')];
    const stack = pushChild([], defaultPushParams({ appType: 'workflow', parentMessages: parentMsgs }));

    const level = stack[0] as CompositionLevel | undefined;
    expect(level).toBeDefined();
    expect(level!.parentMessages).not.toBe(parentMsgs);
    expect(level!.parentMessages).toEqual(parentMsgs);
  });

  it('1f: composition stack round-trip fidelity', () => {
    const rootMsgs = [makeUserMessage('root')];
    const stack1 = pushChild([], defaultPushParams({ parentMessages: rootMsgs }));
    const childMsgs = getActiveMessages(stack1, rootMsgs);

    const stack2 = pushChild(stack1, defaultPushParams({ task: 'grandchild', parentMessages: childMsgs }));

    const serialized = JSON.stringify({ stack: stack2, rootMsgs });
    const parsed = JSON.parse(serialized) as { stack: CompositionLevel[]; rootMsgs: typeof rootMsgs };

    expect(getActiveDepth(parsed.stack)).toBe(2);

    const active = getActiveMessages(parsed.stack, parsed.rootMsgs);
    expect(getTextFromMessage(active[0]!)).toContain('grandchild');
  });
});
