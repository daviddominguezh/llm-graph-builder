'use client';

import { Button } from '@/components/ui/button';
import dayjs from 'dayjs';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { computeNextRun } from './nextRun';
import type { Trigger } from './types';

const NEXT_FORMAT = 'ddd, MMM D · h:mm A';

interface TriggerRowProps {
  trigger: Trigger;
  onClick: () => void;
  onDelete: () => void;
}

function useSubtitle(trigger: Trigger): string {
  const t = useTranslations('editor.triggers');
  if (trigger.mode === 'after-event') return t('previewAfterEvent');
  const next = computeNextRun(trigger, dayjs());
  if (!next) return t('previewNone');
  return next.locale('en').format(NEXT_FORMAT);
}

export function TriggerRow({ trigger, onClick, onDelete }: TriggerRowProps) {
  const t = useTranslations('editor.triggers');
  const subtitle = useSubtitle(trigger);
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/30 cursor-pointer"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs font-medium">{t(`summaryMode.${trigger.mode}`)}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">{subtitle}</span>
        </div>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleDelete}
        aria-label={t('delete')}
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
