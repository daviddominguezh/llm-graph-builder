import { useAgent } from '../app/agentContext.js';
import { useT } from '../app/i18nContext.js';
import type { StoredSession } from '../storage/indexeddb.js';
import { CopilotHeader } from './CopilotHeader.js';
import { CopilotInput } from './CopilotInput.js';
import { CopilotMessages } from './CopilotMessages.js';
import type { CopilotSession } from './copilotTypes.js';
import { useChatStream } from './useChatStream.js';
import { useSessions } from './useSessions.js';

export interface CopilotPanelProps {
  standalone?: boolean;
  onClose?: () => void;
}

function toSession(s: StoredSession): CopilotSession {
  return { id: s.sessionId, title: s.title, messages: s.messages, createdAt: s.createdAt };
}

function containerClasses(standalone: boolean): string {
  if (standalone) return 'flex flex-col w-full h-full';
  return 'flex flex-col w-[calc(100%-var(--spacing)*3)] h-[calc(100%-var(--spacing)*3)] m-1.5 bg-background rounded-xl shadow-sm dark:shadow-none';
}

export function CopilotPanel({ standalone = false, onClose }: CopilotPanelProps = {}) {
  const agent = useAgent();
  const t = useT();
  const sessions = useSessions({ tenant: agent.tenant, agentSlug: agent.agentSlug });
  const { stream, send } = useChatStream({ agent, sessions });

  const copilotSessions = sessions.sessions.map(toSession);
  const activeSession = copilotSessions.find((s) => s.id === sessions.currentSessionId) ?? null;

  const streamingMsg =
    stream.blocks !== null
      ? { id: 'streaming', role: 'assistant' as const, blocks: stream.blocks, timestamp: Date.now() }
      : null;
  const visibleMessages = streamingMsg !== null ? [...sessions.messages, streamingMsg] : sessions.messages;

  return (
    <div className={containerClasses(standalone)}>
      <CopilotHeader
        standalone={standalone}
        onClose={onClose}
        sessions={copilotSessions}
        activeSession={activeSession}
        onSwitchSession={(id: string) => {
          void sessions.switchSession(id);
        }}
        onNewChat={() => {
          void sessions.createSession();
        }}
      />
      <CopilotMessages messages={visibleMessages} />
      {stream.error !== null && <div className="border-t px-4 py-2 text-xs text-red-500">{stream.error}</div>}
      {stream.terminal === 'unavailable' && (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">{t('assistantUnavailable')}</div>
      )}
      {stream.terminal === null && (
        <CopilotInput
          onSend={(text) => {
            void send(text);
          }}
          isStreaming={stream.blocks !== null}
        />
      )}
    </div>
  );
}
