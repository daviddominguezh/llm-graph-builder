'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

function kbdClassName(pressed: boolean): string {
  const base =
    'font-mono text-[10px] px-1.5 h-[18px] inline-flex items-center rounded border transition-all duration-150';
  const state = pressed
    ? 'translate-y-[1px] bg-primary/15 text-primary border-primary/40'
    : 'text-muted-foreground bg-muted/40';
  return `${base} ${state}`;
}

function KbdHint({ pressed }: { pressed: boolean }): React.JSX.Element {
  return <kbd className={kbdClassName(pressed)}>⌘O</kbd>;
}

interface UploaderHeaderProps {
  onAdd: () => void;
  kbdPressed: boolean;
}

export function UploaderHeader({ onAdd, kbdPressed }: UploaderHeaderProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase');
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          type="button"
          className="h-7 gap-1.5 text-xs"
          onClick={onAdd}
        >
          <Plus className="size-3.5" />
          <span>{t('addFiles')}</span>
        </Button>
        <KbdHint pressed={kbdPressed} />
      </div>
      <span className="font-mono text-[11px] text-muted-foreground/80 select-none truncate">
        {t('extensions')}
      </span>
    </div>
  );
}
