'use client';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useCopilotContext } from './CopilotProvider';
import { CopilotInput } from './CopilotInput';
import { CopilotMessages } from './CopilotMessages';
import type { CopilotSession } from './copilotTypes';

interface CopilotHeaderProps {
  sessions: CopilotSession[];
  activeSessionId: string | null;
  onValueChange: (value: string) => void;
  onClose: () => void;
}

function CopilotHeader({ sessions, activeSessionId, onValueChange, onClose }: CopilotHeaderProps) {
  const t = useTranslations('copilot');

  const sorted = [...sessions].sort((a, b) => b.createdAt - a.createdAt);
  const currentValue = activeSessionId ?? 'new';

  const items = [
    { value: 'new', label: t('newChat') },
    ...sorted.map((s) => ({ value: s.id, label: s.title })),
  ];

  return (
    <div className="flex items-center justify-between border-b px-3 py-2">
      <Select value={currentValue} items={items} onValueChange={(v) => onValueChange(v ?? 'new')}>
        <SelectTrigger size="sm" className="h-8 min-w-[140px] text-xs">
          <SelectValue placeholder={t('selectChat')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="new">{t('newChat')}</SelectItem>
          {sorted.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="sm" className="h-8 w-8" onClick={onClose} aria-label={t('close')}>
        <X className="size-4" />
      </Button>
    </div>
  );
}

export function CopilotPanel() {
  const ctx = useCopilotContext();

  if (!ctx.isOpen) return null;

  function handleValueChange(value: string) {
    if (value === 'new') {
      ctx.createSession();
    } else {
      ctx.switchSession(value);
    }
  }

  return (
    <div className="fixed bottom-0 right-0 top-0 z-40 flex w-[400px] flex-col border-l bg-background shadow-xl">
      <CopilotHeader
        sessions={ctx.sessions}
        activeSessionId={ctx.activeSession?.id ?? null}
        onValueChange={handleValueChange}
        onClose={() => ctx.setOpen(false)}
      />
      <CopilotMessages messages={ctx.activeSession?.messages ?? []} />
      <CopilotInput onSend={ctx.sendMessage} onStop={ctx.stopStreaming} isStreaming={ctx.isStreaming} />
    </div>
  );
}
