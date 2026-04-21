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
}

function RightPane({ sessions, chat, title }: RightPaneProps) {
  const hasActive = sessions.messages.length > 0 || chat.stream.blocks !== null;
  const visible = buildVisibleMessages({ messages: sessions.messages, streamingBlocks: chat.stream.blocks });
  if (!hasActive) {
    return <WelcomeView onSend={(t) => handleSend(chat, t)} isStreaming={chat.stream.blocks !== null} />;
  }
  return (
    <ChatView
      title={title}
      messages={visible}
      onSend={(t) => handleSend(chat, t)}
      isStreaming={chat.stream.blocks !== null}
      streamError={chat.stream.error}
      terminalUnavailable={chat.stream.terminal === 'unavailable'}
    />
  );
}

export function StandaloneLayout({ sessions, chat }: StandaloneLayoutProps) {
  const t = useT();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const title = useActiveTitle(sessions, t('newChat'));

  return (
    <div
      className={
        sidebarOpen ? 'grid grid-cols-[260px_1fr] h-dvh w-full' : 'grid grid-cols-[0_1fr] h-dvh w-full'
      }
    >
      {sidebarOpen && (
        <Sidebar
          sessions={sessions.sessions}
          activeSessionId={sessions.currentSessionId}
          onNewChat={() => handleNewChat(sessions)}
          onSelectSession={(id) => handleSelect(sessions, id)}
          onCollapse={() => setSidebarOpen(false)}
        />
      )}
      <RightPane sessions={sessions} chat={chat} title={title} />
    </div>
  );
}
