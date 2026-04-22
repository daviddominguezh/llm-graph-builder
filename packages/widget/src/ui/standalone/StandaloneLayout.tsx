import { useState } from 'react';

import { useT } from '../../app/i18nContext.js';
import type { CopilotMessage } from '../copilotTypes.js';
import type { useChatStream } from '../useChatStream.js';
import type { useSessions } from '../useSessions.js';
import { ChatView } from './ChatView.js';
import { Sidebar } from './Sidebar.js';
import { WelcomeView } from './WelcomeView.js';

export interface StandaloneLayoutProps {
  sessions: ReturnType<typeof useSessions>;
  chat: ReturnType<typeof useChatStream>;
}

interface BuildVisibleArgs {
  messages: CopilotMessage[];
  streamingBlocks: NonNullable<ReturnType<typeof useChatStream>['stream']['blocks']> | null;
}

function buildVisibleMessages({ messages, streamingBlocks }: BuildVisibleArgs): CopilotMessage[] {
  if (streamingBlocks === null) return messages;
  const streamingMsg: CopilotMessage = {
    id: 'streaming',
    role: 'assistant',
    blocks: streamingBlocks,
    timestamp: Date.now(),
  };
  return [...messages, streamingMsg];
}

function useActiveTitle(sessions: ReturnType<typeof useSessions>, fallback: string): string {
  const active = sessions.sessions.find((s) => s.sessionId === sessions.currentSessionId);
  return active?.title ?? fallback;
}

function useActiveStarred(sessions: ReturnType<typeof useSessions>): boolean {
  const active = sessions.sessions.find((s) => s.sessionId === sessions.currentSessionId);
  return active?.starred === true;
}

function handleSend(chat: ReturnType<typeof useChatStream>, text: string): void {
  void chat.send(text);
}

function handleNewChat(sessions: ReturnType<typeof useSessions>): void {
  void sessions.createSession();
}

function handleSelect(sessions: ReturnType<typeof useSessions>, id: string): void {
  void sessions.switchSession(id);
}

interface RightPaneProps {
  sessions: ReturnType<typeof useSessions>;
  chat: ReturnType<typeof useChatStream>;
  title: string;
  starred: boolean;
  onOpenSidebar?: () => void;
}

function RightPane({ sessions, chat, title, starred, onOpenSidebar }: RightPaneProps) {
  const hasActive = sessions.messages.length > 0 || chat.stream.blocks !== null;
  const visible = buildVisibleMessages({ messages: sessions.messages, streamingBlocks: chat.stream.blocks });
  if (!hasActive) {
    return (
      <WelcomeView
        onSend={(t) => handleSend(chat, t)}
        isStreaming={chat.stream.blocks !== null}
        onOpenSidebar={onOpenSidebar}
      />
    );
  }
  return (
    <ChatView
      title={title}
      sessionId={sessions.currentSessionId ?? undefined}
      starred={starred}
      messages={visible}
      onSend={(t) => handleSend(chat, t)}
      isStreaming={chat.stream.blocks !== null}
      streamError={chat.stream.error}
      terminalUnavailable={chat.stream.terminal === 'unavailable'}
      onOpenSidebar={onOpenSidebar}
      onRename={(id, newTitle) => {
        void sessions.renameSession(id, newTitle);
      }}
      onDelete={(id) => {
        void sessions.deleteSession(id);
      }}
      onToggleStar={(id) => {
        void sessions.toggleStarSession(id);
      }}
    />
  );
}

export function StandaloneLayout({ sessions, chat }: StandaloneLayoutProps) {
  const t = useT();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const title = useActiveTitle(sessions, t('newChat'));
  const starred = useActiveStarred(sessions);

  const gridClasses = sidebarOpen
    ? 'grid grid-cols-[288px_1fr] h-dvh w-full'
    : 'grid grid-cols-1 h-dvh w-full';

  return (
    <div className={gridClasses}>
      {sidebarOpen && (
        <Sidebar
          sessions={sessions.sessions}
          activeSessionId={sessions.currentSessionId}
          onNewChat={() => handleNewChat(sessions)}
          onSelectSession={(id) => handleSelect(sessions, id)}
          onRenameSession={(id, newTitle) => {
            void sessions.renameSession(id, newTitle);
          }}
          onDeleteSession={(id) => {
            void sessions.deleteSession(id);
          }}
          onToggleStarSession={(id) => {
            void sessions.toggleStarSession(id);
          }}
          onCollapse={() => setSidebarOpen(false)}
        />
      )}
      <RightPane
        sessions={sessions}
        chat={chat}
        title={title}
        starred={starred}
        onOpenSidebar={sidebarOpen ? undefined : () => setSidebarOpen(true)}
      />
    </div>
  );
}
