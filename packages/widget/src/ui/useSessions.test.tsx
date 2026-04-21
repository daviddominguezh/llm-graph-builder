import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessions } from './useSessions.js';

describe('useSessions', () => {
  it('creates a session on first send and persists the user message', async () => {
    const { result } = renderHook(() => useSessions({ tenant: 'acme', agentSlug: 'x' }));
    await act(async () => {
      await result.current.createSession();
    });
    await act(async () => {
      await result.current.appendUserMessage('hello');
    });
    expect(result.current.messages.length).toBe(1);
    expect(result.current.messages[0]!.role).toBe('user');
  });

  it('finalizeAssistantMessage persists to backend', async () => {
    const { result } = renderHook(() => useSessions({ tenant: 'acme', agentSlug: 'x' }));
    await act(async () => {
      await result.current.createSession();
    });
    await act(async () => {
      await result.current.finalizeAssistantMessage([{ type: 'text', content: 'hi back' }]);
    });
    expect(result.current.messages.at(-1)?.role).toBe('assistant');
  });
});
