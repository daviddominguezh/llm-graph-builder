import { useCallback, useState } from 'react';

import { BlockCoalescer } from '../api/eventToBlock.js';
import { execute } from '../api/executeClient.js';
import type { CopilotMessageBlock } from './copilotTypes.js';
import type { useSessions } from './useSessions.js';

export interface AgentRef {
  tenant: string;
  agentSlug: string;
  version: number;
}

export interface StreamingState {
  blocks: CopilotMessageBlock[] | null;
  error: string | null;
  terminal: 'unavailable' | null;
}

export interface UseChatStreamArgs {
  agent: AgentRef;
  sessions: ReturnType<typeof useSessions>;
}

export interface UseChatStreamResult {
  stream: StreamingState;
  send: (text: string) => Promise<void>;
}

type SetStream = (fn: (prev: StreamingState) => StreamingState) => void;

const INITIAL_STREAMING: StreamingState = { blocks: null, error: null, terminal: null };
const HTTP_NOT_FOUND = 404;
const HTTP_GONE = 410;

function handleStreamError(e: unknown, setStream: SetStream): void {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes(String(HTTP_NOT_FOUND)) || msg.includes(String(HTTP_GONE))) {
    setStream(() => ({ blocks: null, error: null, terminal: 'unavailable' }));
  } else {
    setStream(() => ({ blocks: null, error: msg, terminal: null }));
  }
}

interface RunStreamArgs {
  agent: AgentRef;
  sessions: ReturnType<typeof useSessions>;
  sessionId: string;
  text: string;
  setStream: SetStream;
}

interface HandleEventArgs {
  ev: Awaited<ReturnType<typeof execute> extends AsyncGenerator<infer E> ? E : never>;
  coalescer: BlockCoalescer;
  sessions: ReturnType<typeof useSessions>;
  sessionId: string;
  setStream: SetStream;
}

async function handleStreamEvent({
  ev,
  coalescer,
  sessions,
  sessionId,
  setStream,
}: HandleEventArgs): Promise<'continue' | 'done'> {
  if (ev.type === 'error') {
    setStream(() => ({ blocks: null, error: ev.message, terminal: null }));
    return 'done';
  }
  if (ev.type === 'done') {
    await sessions.finalizeAssistantMessage(coalescer.finalize(), sessionId);
    setStream(() => INITIAL_STREAMING);
    return 'done';
  }
  coalescer.push(ev);
  setStream(() => ({ blocks: coalescer.snapshot(), error: null, terminal: null }));
  return 'continue';
}

interface ConsumeArgs {
  stream: ReturnType<typeof execute>;
  coalescer: BlockCoalescer;
  sessions: ReturnType<typeof useSessions>;
  sessionId: string;
  setStream: SetStream;
}

async function consumeStream({
  stream,
  coalescer,
  sessions,
  sessionId,
  setStream,
}: ConsumeArgs): Promise<void> {
  for await (const ev of stream) {
    const status = await handleStreamEvent({ ev, coalescer, sessions, sessionId, setStream });
    if (status === 'done') return;
  }
}

async function runStream({ agent, sessions, sessionId, text, setStream }: RunStreamArgs): Promise<void> {
  const coalescer = new BlockCoalescer();
  setStream(() => ({ blocks: [], error: null, terminal: null }));
  const stream = execute({
    tenant: agent.tenant,
    agent: agent.agentSlug,
    version: agent.version,
    tenantId: agent.tenant,
    userId: sessionId,
    sessionId,
    text,
  });
  try {
    await consumeStream({ stream, coalescer, sessions, sessionId, setStream });
  } catch (e) {
    handleStreamError(e, setStream);
  }
}

export function useChatStream({ agent, sessions }: UseChatStreamArgs): UseChatStreamResult {
  const [stream, setStream] = useState<StreamingState>(INITIAL_STREAMING);

  const send = useCallback(
    async (text: string) => {
      const sessionId = sessions.currentSessionId ?? (await sessions.createSession());
      await sessions.appendUserMessage(text, sessionId);
      await runStream({ agent, sessions, sessionId, text, setStream });
    },
    [agent, sessions]
  );

  return { stream, send };
}
