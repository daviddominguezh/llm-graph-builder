import { useEffect, useRef } from 'react';

import { useT } from '../../app/i18nContext.js';
import type { CopilotMessage } from '../copilotTypes.js';
import { ComposerInput } from './ComposerInput.js';
import { MessageRow } from './MessageRow.js';
import { TopBar } from './TopBar.js';

export interface ChatViewProps {
  title: string;
  sessionId?: string;
  starred?: boolean;
  messages: CopilotMessage[];
  onSend: (text: string) => void;
  isStreaming: boolean;
  streamError: string | null;
  terminalUnavailable: boolean;
  onOpenSidebar?: () => void;
  onRename?: (id: string, newTitle: string) => void;
  onDelete?: (id: string) => void;
  onToggleStar?: (id: string) => void;
}

function useScrollToBottom(dep: unknown): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dep]);
  return ref;
}

function MessagesArea({ messages }: { messages: CopilotMessage[] }) {
  const sentinel = useScrollToBottom(messages);
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
        <div ref={sentinel} />
      </div>
    </div>
  );
}

interface FooterProps {
  isStreaming: boolean;
  streamError: string | null;
  terminalUnavailable: boolean;
  onSend: (text: string) => void;
}

function ChatFooter({ isStreaming, streamError, terminalUnavailable, onSend }: FooterProps) {
  const t = useT();
  return (
    <div className="shrink-0 border-t border-border">
      <div className="max-w-2xl mx-auto w-full px-4 py-4">
        {streamError !== null && <div className="pb-2 text-xs text-red-500">{streamError}</div>}
        {terminalUnavailable ? (
          <div className="text-xs text-muted-foreground">{t('assistantUnavailable')}</div>
        ) : (
          <ComposerInput variant="chat" onSend={onSend} isStreaming={isStreaming} />
        )}
      </div>
    </div>
  );
}

export function ChatView({
  title,
  sessionId,
  starred,
  messages,
  onSend,
  isStreaming,
  streamError,
  terminalUnavailable,
  onOpenSidebar,
  onRename,
  onDelete,
  onToggleStar,
}: ChatViewProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <TopBar
        title={title}
        sessionId={sessionId}
        starred={starred}
        bordered={messages.length > 0}
        onRename={onRename}
        onDelete={onDelete}
        onToggleStar={onToggleStar}
        onOpenSidebar={onOpenSidebar}
      />
      <MessagesArea messages={messages} />
      <ChatFooter
        isStreaming={isStreaming}
        streamError={streamError}
        terminalUnavailable={terminalUnavailable}
        onSend={onSend}
      />
    </div>
  );
}
