import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { openSessionsDB } from '../storage/indexeddb.js';
import { useSessions } from './useSessions.js';

async function clearSessions(): Promise<void> {
  const db = await openSessionsDB();
  await db.clear('sessions');
}

describe('useSessions', () => {
  beforeEach(clearSessions);

  it('does not persist an empty session until the first user message', async () => {
    const { result } = renderHook(() => useSessions({ tenant: 'acme', agentSlug: 'x' }));
    await act(async () => {
      await result.current.createSession();
    });
    expect(result.current.currentSessionId).not.toBeNull();
    expect(result.current.sessions).toHaveLength(0);
    expect(result.current.messages).toHaveLength(0);
  });

  it('creates the stored session on first user message using the text as title', async () => {
    const { result } = renderHook(() => useSessions({ tenant: 'acme', agentSlug: 'x' }));
    await act(async () => {
      await result.current.createSession();
    });
    await act(async () => {
      await result.current.appendUserMessage('hello world');
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]!.role).toBe('user');
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0]!.title).toBe('hello world');
  });

  it('appends further user messages to the existing stored session', async () => {
    const { result } = renderHook(() => useSessions({ tenant: 'acme', agentSlug: 'x' }));
    await act(async () => {
      await result.current.createSession();
    });
    await act(async () => {
      await result.current.appendUserMessage('first');
    });
    await act(async () => {
      await result.current.appendUserMessage('second');
    });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0]!.title).toBe('first');
  });

  it('finalizeAssistantMessage is a no-op without a stored session yet', async () => {
    const { result } = renderHook(() => useSessions({ tenant: 'acme', agentSlug: 'x' }));
    await act(async () => {
      await result.current.createSession();
    });
    await act(async () => {
      await result.current.finalizeAssistantMessage([{ type: 'text', content: 'hi back' }]);
    });
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.sessions).toHaveLength(0);
  });

  it('finalizeAssistantMessage persists after the first user message', async () => {
    const { result } = renderHook(() => useSessions({ tenant: 'acme', agentSlug: 'x' }));
    await act(async () => {
      await result.current.createSession();
    });
    await act(async () => {
      await result.current.appendUserMessage('hello');
    });
    await act(async () => {
      await result.current.finalizeAssistantMessage([{ type: 'text', content: 'hi back' }]);
    });
    expect(result.current.messages.at(-1)?.role).toBe('assistant');
  });

  it('renameSession updates the title of the active session', async () => {
    const { result } = renderHook(() => useSessions({ tenant: 'acme', agentSlug: 'x' }));
    await act(async () => {
      await result.current.createSession();
    });
    await act(async () => {
      await result.current.appendUserMessage('hello');
    });
    const id = result.current.currentSessionId!;
    await act(async () => {
      await result.current.renameSession(id, 'My renamed chat');
    });
    expect(result.current.sessions[0]!.title).toBe('My renamed chat');
  });

  it('renameSession is a no-op when the trimmed title equals the existing one', async () => {
    const { result } = renderHook(() => useSessions({ tenant: 'acme', agentSlug: 'x' }));
    await act(async () => {
      await result.current.createSession();
    });
    await act(async () => {
      await result.current.appendUserMessage('hello');
    });
    const id = result.current.currentSessionId!;
    const originalUpdatedAt = result.current.sessions[0]!.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await act(async () => {
      await result.current.renameSession(id, '  hello  ');
    });
    expect(result.current.sessions[0]!.updatedAt).toBe(originalUpdatedAt);
  });

  it('deleteSession removes the session and clears currentSessionId when active', async () => {
    const { result } = renderHook(() => useSessions({ tenant: 'acme', agentSlug: 'x' }));
    await act(async () => {
      await result.current.createSession();
    });
    await act(async () => {
      await result.current.appendUserMessage('hello');
    });
    const id = result.current.currentSessionId!;
    await act(async () => {
      await result.current.deleteSession(id);
    });
    expect(result.current.sessions).toHaveLength(0);
    expect(result.current.currentSessionId).toBeNull();
  });

  it('toggleStarSession flips the flag and preserves updatedAt', async () => {
    const { result } = renderHook(() => useSessions({ tenant: 'acme', agentSlug: 'x' }));
    await act(async () => {
      await result.current.createSession();
    });
    await act(async () => {
      await result.current.appendUserMessage('hello');
    });
    const id = result.current.currentSessionId!;
    const originalUpdatedAt = result.current.sessions[0]!.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await act(async () => {
      await result.current.toggleStarSession(id);
    });
    expect(result.current.sessions[0]!.starred).toBe(true);
    expect(result.current.sessions[0]!.updatedAt).toBe(originalUpdatedAt);
    await act(async () => {
      await result.current.toggleStarSession(id);
    });
    expect(result.current.sessions[0]!.starred).toBe(false);
  });
});
