import { useState } from 'react';

import { useT } from '../../app/i18nContext.js';
import type { CopilotMessage } from '../copilotTypes.js';
import type { useChatStream } from '../useChatStream.js';
import type { useSessions } from '../useSessions.js';
import { ChatView } from './ChatView.js';
import { Sidebar } from './Sidebar.js';
import { SidebarRail } from './SidebarRail.js';
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
  // Open by default on desktop (>= md); closed on mobile so the chat is visible first.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  const title = useActiveTitle(sessions, t('newChat'));
  const starred = useActiveStarred(sessions);

  function handleSelectAndClose(id: string): void {
    handleSelect(sessions, id);
    if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false);
  }

  const fullSidebar = (
    <Sidebar
      sessions={sessions.sessions}
      activeSessionId={sessions.currentSessionId}
      onNewChat={() => handleNewChat(sessions)}
      onSelectSession={handleSelectAndClose}
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
  );

  // Desktop: always visible. Width animates between expanded (288px) and
  // collapsed rail (48px). Content swaps based on state.
  const desktopSidebar = (
    <div
      className={`hidden md:flex shrink-0 h-full overflow-hidden transition-[width] duration-200 ease-out ${sidebarOpen ? 'w-72' : 'w-12'}`}
    >
      {sidebarOpen ? (
        fullSidebar
      ) : (
        <SidebarRail onExpand={() => setSidebarOpen(true)} onNewChat={() => handleNewChat(sessions)} />
      )}
    </div>
  );

  // Mobile: overlay when open, hidden otherwise.
  const mobileSidebar = sidebarOpen ? (
    <div className="fixed inset-0 z-40 md:hidden flex">
      <div className="w-72 shrink-0">{fullSidebar}</div>
      <button
        type="button"
        aria-label={t('collapseSidebar')}
        onClick={() => setSidebarOpen(false)}
        className="flex-1 bg-black/30 backdrop-blur-sm cursor-default"
      />
    </div>
  ) : null;

  return (
    <div className="flex h-dvh w-full">
      {desktopSidebar}
      {mobileSidebar}
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
