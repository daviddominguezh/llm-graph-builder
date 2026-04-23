import { useCallback, useState } from 'react';

import { BlockCoalescer } from '../api/eventToBlock.js';
import { execute } from '../api/executeClient.js';
import type { CopilotMessageBlock } from './copilotTypes.js';
import type { useSessions } from './useSessions.js';

const THINKING_BLOCK: CopilotMessageBlock = { type: 'thinking' };

function withThinking(blocks: CopilotMessageBlock[], idle: boolean): CopilotMessageBlock[] {
  return idle ? [...blocks, THINKING_BLOCK] : blocks;
}

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
  userId?: string;
  metadata?: Record<string, unknown>;
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
  userId?: string;
  metadata?: Record<string, unknown>;
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
  setStream(() => ({
    blocks: withThinking(coalescer.snapshot(), coalescer.isIdle()),
    error: null,
    terminal: null,
  }));
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

async function runStream(args: RunStreamArgs): Promise<void> {
  const { agent, sessions, sessionId, text, setStream, userId, metadata } = args;
  const coalescer = new BlockCoalescer();
  setStream(() => ({ blocks: [THINKING_BLOCK], error: null, terminal: null }));
  const stream = execute({
    tenant: agent.tenant,
    agent: agent.agentSlug,
    version: agent.version,
    tenantId: agent.tenant,
    userId: userId ?? sessionId,
    sessionId,
    text,
    metadata,
  });
  try {
    await consumeStream({ stream, coalescer, sessions, sessionId, setStream });
  } catch (e) {
    handleStreamError(e, setStream);
  }
}

export function useChatStream({ agent, sessions, userId, metadata }: UseChatStreamArgs): UseChatStreamResult {
  const [stream, setStream] = useState<StreamingState>(INITIAL_STREAMING);

  const send = useCallback(
    async (text: string) => {
      const sessionId = sessions.currentSessionId ?? (await sessions.createSession());
      await sessions.appendUserMessage(text, sessionId);
      await runStream({ agent, sessions, sessionId, text, setStream, userId, metadata });
    },
    [agent, sessions, userId, metadata]
  );

  return { stream, send };
}
