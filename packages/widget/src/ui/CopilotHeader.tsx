import { History, Plus, X } from 'lucide-react';

import { useT } from '../app/i18nContext.js';
import { Button } from './primitives/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './primitives/dropdown-menu.js';
import type { CopilotSession } from './copilotTypes.js';

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

export interface CopilotHeaderProps {
  sessions: CopilotSession[];
  activeSession: CopilotSession | null;
  onNewChat: () => void;
  onSwitchSession: (id: string) => void;
  onClose?: () => void;
  standalone?: boolean;
}

function SessionItem({
  session,
  isCurrent,
  onSwitch,
}: {
  session: CopilotSession;
  isCurrent: boolean;
  onSwitch: (id: string) => void;
}) {
  return (
    <DropdownMenuItem
      disabled={isCurrent}
      onClick={isCurrent ? undefined : () => onSwitch(session.id)}
    >
      <div className="flex w-full flex-col gap-0.5 overflow-hidden">
        <span className="truncate text-xs">{getSessionLabel(session)}</span>
        <span className="text-[10px] text-muted-foreground">{getLastMessageTime(session)}</span>
      </div>
    </DropdownMenuItem>
  );
}

export function CopilotHeader({
  sessions,
  activeSession,
  onNewChat,
  onSwitchSession,
  onClose,
  standalone = false,
}: CopilotHeaderProps) {
  const t = useT();
  const sorted = [...sessions].sort((a, b) => b.createdAt - a.createdAt);
  const activeIsEmpty = activeSession === null || activeSession.messages.length === 0;
  const canShowHistory = sorted.length > 1 || (sorted.length >= 1 && activeIsEmpty);
  const canCreateNew =
    activeSession !== null && activeSession.messages.length >= MIN_MESSAGES_FOR_NEW_CHAT;
  const withMessages = sorted.filter((s) => s.messages.length > 0);

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
                disabled={!canShowHistory}
                aria-label={t('selectChat')}
              >
                <History className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent side="bottom" align="end" className="max-h-60 w-64 overflow-y-auto">
            {withMessages.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                isCurrent={s.id === activeSession?.id}
                onSwitch={onSwitchSession}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {!standalone && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8"
            onClick={onClose}
            aria-label={t('close')}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
