'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { History, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useCopilotContext } from './CopilotProvider';
import { CopilotInput } from './CopilotInput';
import { CopilotMessages } from './CopilotMessages';
import type { CopilotSession } from './copilotTypes';

const MIN_MESSAGES_FOR_NEW_CHAT = 1;

function getSessionLabel(session: CopilotSession): string {
  const firstMsg = session.messages[0];
  if (!firstMsg) return '';
  const block = firstMsg.blocks[0];
  if (!block || block.type !== 'text') return '';
  return block.content;
}

function getLastMessageTime(session: CopilotSession): string {
  const last = session.messages[session.messages.length - 1];
  if (!last) return '';
  return new Date(last.timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface CopilotHeaderProps {
  sessions: CopilotSession[];
  activeSession: CopilotSession | null;
  onNewChat: () => void;
  onSwitchSession: (id: string) => void;
  onClose: () => void;
}

function CopilotHeader({ sessions, activeSession, onNewChat, onSwitchSession, onClose }: CopilotHeaderProps) {
  const t = useTranslations('copilot');
  const sorted = [...sessions].sort((a, b) => b.createdAt - a.createdAt);
  const hasChats = sorted.length > 0;
  const canCreateNew = activeSession === null || activeSession.messages.length >= MIN_MESSAGES_FOR_NEW_CHAT;

  return (
    <div className="flex items-center justify-between border-b px-3 py-2">
      <span className="text-xs font-semibold">{t('title')}</span>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8"
          onClick={onNewChat}
          disabled={!canCreateNew}
          aria-label={t('newChat')}
        >
          <Plus className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8"
                disabled={!hasChats}
                aria-label={t('selectChat')}
              >
                <History className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent side="bottom" align="end" className="max-h-60 w-64 overflow-y-auto">
            {sorted.map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => onSwitchSession(s.id)}>
                <div className="flex w-full flex-col gap-0.5 overflow-hidden">
                  <span className="truncate text-xs">{getSessionLabel(s) || t('newChat')}</span>
                  <span className="text-[10px] text-muted-foreground">{getLastMessageTime(s)}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" className="h-8 w-8" onClick={onClose} aria-label={t('close')}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function CopilotPanel() {
  const ctx = useCopilotContext();

  if (!ctx.isOpen) return null;

  return (
    <div className="fixed bottom-1.5 right-1.5 top-1.5 z-40 flex w-[400px] flex-col border bg-background rounded-md">
      <CopilotHeader
        sessions={ctx.sessions}
        activeSession={ctx.activeSession}
        onNewChat={() => ctx.createSession()}
        onSwitchSession={ctx.switchSession}
        onClose={() => ctx.setOpen(false)}
      />
      <CopilotMessages messages={ctx.activeSession?.messages ?? []} />
      <CopilotInput onSend={ctx.sendMessage} onStop={ctx.stopStreaming} isStreaming={ctx.isStreaming} />
    </div>
  );
}
