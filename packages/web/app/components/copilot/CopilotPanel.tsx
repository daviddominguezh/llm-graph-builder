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

import { CopilotInput } from './CopilotInput';
import { CopilotMessages } from './CopilotMessages';
import { useCopilotContext } from './CopilotProvider';
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
  const activeIsEmpty = activeSession === null || activeSession.messages.length === 0;
  const canShowHistory = sorted.length > 1 || (sorted.length >= 1 && activeIsEmpty);
  const canCreateNew = activeSession !== null && activeSession.messages.length >= MIN_MESSAGES_FOR_NEW_CHAT;

  return (
    <div className="sticky top-0 z-10 shrink-0 flex items-center justify-between pl-2 pr-0.5 py-0.5 bg-background ">
      <span className="text-xs font-semibold cursor-default">{t('title')}</span>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="default"
          className="aspect-square! px-0"
          onClick={onNewChat}
          disabled={!canCreateNew}
          aria-label={t('newChat')}
        >
          <Plus />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="default"
                className="aspect-square! px-0"
                disabled={!canShowHistory}
                aria-label={t('selectChat')}
              >
                <History />
              </Button>
            }
          />
          <DropdownMenuContent side="bottom" align="end" className="max-h-60 w-64 overflow-y-auto">
            {sorted
              .filter((s) => s.messages.length > 0)
              .map((s) => {
                const isCurrent = s.id === activeSession?.id;
                return (
                  <DropdownMenuItem
                    key={s.id}
                    disabled={isCurrent}
                    onClick={isCurrent ? undefined : () => onSwitchSession(s.id)}
                  >
                    <div className="flex w-full flex-col gap-0.5 overflow-hidden">
                      <span className="truncate text-xs">{getSessionLabel(s)}</span>
                      <span className="text-[10px] text-muted-foreground">{getLastMessageTime(s)}</span>
                    </div>
                  </DropdownMenuItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="default"
          className="aspect-square! px-0"
          onClick={onClose}
          aria-label={t('close')}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}

export function CopilotPanel() {
  const ctx = useCopilotContext();

  if (!ctx.isOpen) return null;

  return (
    <div className="fixed bottom-[calc((var(--spacing)*2.5)_-_0px)] top-[calc((var(--spacing)*5.5)-2px)] right-2.5 top-1.5 z-40 flex w-[400px] flex-col border bg-background rounded-xl  overflow-hidden">
      <CopilotHeader
        sessions={ctx.sessions}
        activeSession={ctx.activeSession}
        onNewChat={() => ctx.createSession()}
        onSwitchSession={ctx.switchSession}
        onClose={() => ctx.setOpen(false)}
      />
      <div className="flex flex-col flex-1 min-h-0 w-full rounded-lg bg-input/70">
        <CopilotMessages messages={ctx.activeSession?.messages ?? []} />
        <CopilotInput onSend={ctx.sendMessage} onStop={ctx.stopStreaming} isStreaming={ctx.isStreaming} />
      </div>
    </div>
  );
}
