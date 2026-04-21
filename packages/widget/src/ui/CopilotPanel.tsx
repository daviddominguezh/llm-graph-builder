import { useCallback, useState } from 'react';

import { execute } from '../api/executeClient.js';
import { BlockCoalescer } from '../api/eventToBlock.js';
import { useAgent } from '../app/agentContext.js';
import type { StoredSession } from '../storage/indexeddb.js';
import { CopilotHeader } from './CopilotHeader.js';
import { CopilotInput } from './CopilotInput.js';
import { CopilotMessages } from './CopilotMessages.js';
import type { CopilotMessageBlock, CopilotSession } from './copilotTypes.js';
import { useSessions } from './useSessions.js';

export interface CopilotPanelProps {
  standalone?: boolean;
  onClose?: () => void;
}

interface StreamingState {
  blocks: CopilotMessageBlock[] | null;
  error: string | null;
  terminal: 'unavailable' | null;
}

interface AgentRef {
  tenant: string;
  agentSlug: string;
  version: number;
}

type SetStream = (fn: (prev: StreamingState) => StreamingState) => void;

const INITIAL_STREAMING: StreamingState = { blocks: null, error: null, terminal: null };
const HTTP_NOT_FOUND = 404;
const HTTP_GONE = 410;

function toSession(s: StoredSession): CopilotSession {
  return { id: s.sessionId, title: s.title, messages: s.messages, createdAt: s.createdAt };
}

function containerClasses(standalone: boolean): string {
  if (standalone) return 'flex flex-col w-full h-full';
  return 'fixed top-6 bottom-[calc((var(--spacing)*6)_-_0px)] right-3.5 w-[400px] z-40 flex flex-col bg-background border border-border rounded-lg shadow-lg';
}

function handleStreamError(e: unknown, setStream: SetStream): void {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes(String(HTTP_NOT_FOUND)) || msg.includes(String(HTTP_GONE))) {
    setStream(() => ({ blocks: null, error: null, terminal: 'unavailable' }));
  } else {
    setStream(() => ({ blocks: null, error: msg, terminal: null }));
  }
}

async function runStream(
  agent: AgentRef,
  sessions: ReturnType<typeof useSessions>,
  text: string,
  setStream: SetStream
): Promise<void> {
  const coalescer = new BlockCoalescer();
  setStream(() => ({ blocks: [], error: null, terminal: null }));
  try {
    const sessionId = sessions.currentSessionId ?? 'pending';
    for await (const ev of execute({
      tenant: agent.tenant,
      agent: agent.agentSlug,
      version: agent.version,
      tenantId: agent.tenant,
      userId: sessionId,
      sessionId,
      text,
    })) {
      if (ev.type === 'error') {
        setStream(() => ({ blocks: null, error: ev.message, terminal: null }));
        return;
      }
      if (ev.type === 'done') {
        await sessions.finalizeAssistantMessage(coalescer.finalize());
        setStream(() => INITIAL_STREAMING);
        return;
      }
      coalescer.push(ev);
      setStream(() => ({ blocks: coalescer.snapshot(), error: null, terminal: null }));
    }
  } catch (e) {
    handleStreamError(e, setStream);
  }
}

function useSendHandler(
  agent: AgentRef,
  sessions: ReturnType<typeof useSessions>,
  setStream: SetStream
): (text: string) => Promise<void> {
  return useCallback(
    async (text: string) => {
      if (sessions.currentSessionId === null) await sessions.createSession();
      await sessions.appendUserMessage(text);
      await runStream(agent, sessions, text, setStream);
    },
    [agent, sessions, setStream]
  );
}

export function CopilotPanel({ standalone = false, onClose }: CopilotPanelProps = {}) {
  const agent = useAgent();
  const sessions = useSessions({ tenant: agent.tenant, agentSlug: agent.agentSlug });
  const [stream, setStream] = useState<StreamingState>(INITIAL_STREAMING);

  const send = useSendHandler(agent, sessions, setStream);

  const copilotSessions = sessions.sessions.map(toSession);
  const activeSession = copilotSessions.find((s) => s.id === sessions.currentSessionId) ?? null;

  const streamingMsg = stream.blocks !== null
    ? { id: 'streaming', role: 'assistant' as const, blocks: stream.blocks, timestamp: Date.now() }
    : null;
  const visibleMessages = streamingMsg !== null
    ? [...sessions.messages, streamingMsg]
    : sessions.messages;

  return (
    <div className={containerClasses(standalone)}>
      <CopilotHeader
        standalone={standalone}
        onClose={onClose}
        sessions={copilotSessions}
        activeSession={activeSession}
        onSwitchSession={(id: string) => { void sessions.switchSession(id); }}
        onNewChat={() => { void sessions.createSession(); }}
      />
      <CopilotMessages messages={visibleMessages} />
      {stream.error !== null && (
        <div className="border-t px-4 py-2 text-xs text-red-500">{stream.error}</div>
      )}
      {stream.terminal === 'unavailable' && (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          This assistant is no longer available.
        </div>
      )}
      {stream.terminal === null && (
        <CopilotInput onSend={(text) => { void send(text); }} isStreaming={stream.blocks !== null} />
      )}
    </div>
  );
}
