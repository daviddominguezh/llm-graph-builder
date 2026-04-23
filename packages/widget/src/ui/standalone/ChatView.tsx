import { useRef } from 'react';

import { useT } from '../../app/i18nContext.js';
import type { CopilotMessage } from '../copilotTypes.js';
import { useAutoScroll } from '../useAutoScroll.js';
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

function MessagesArea({ messages }: { messages: CopilotMessage[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinel = useAutoScroll(messages, containerRef);
  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
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
    <div className="shrink-0">
      <div className="max-w-2xl mx-auto w-full px-2 md:px-0 pt-4 pb-2">
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
    <div className="flex flex-col flex-1 min-w-0 h-full min-h-0 bg-card dark:bg-background">
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
