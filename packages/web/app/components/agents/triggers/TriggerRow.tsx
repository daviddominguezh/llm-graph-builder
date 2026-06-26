'use client';

import type { TriggerRow as WireTriggerRow } from '@/app/lib/triggers';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import dayjs from 'dayjs';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

const NEXT_FORMAT = 'ddd, MMM D · h:mm A';

interface TriggerRowProps {
  trigger: WireTriggerRow;
  onSetEnabled: (enabled: boolean) => void;
  onDelete: () => void;
}

function useSubtitle(trigger: WireTriggerRow): string {
  const t = useTranslations('editor.triggers');
  if (!trigger.enabled) return t('paused');
  if (trigger.next_run_at === null) return t('previewNone');
  return dayjs(trigger.next_run_at).locale('en').format(NEXT_FORMAT);
}

function RowMeta({ trigger }: { trigger: WireTriggerRow }) {
  const t = useTranslations('editor.triggers');
  const subtitle = useSubtitle(trigger);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-xs font-medium">{t(`summaryMode.${trigger.mode}`)}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground">{subtitle}</span>
      {trigger.last_status !== null && (
        <span className="text-[10px] text-muted-foreground/70">{trigger.last_status}</span>
      )}
    </div>
  );
}

export function TriggerRow({ trigger, onSetEnabled, onDelete }: TriggerRowProps) {
  const t = useTranslations('editor.triggers');
  const switchLabel = trigger.enabled ? t('disableTrigger') : t('enableTrigger');
  return (
    <div className="group relative flex w-full items-center gap-3 rounded-md border px-3 py-2">
      <RowMeta trigger={trigger} />
      <Switch
        checked={trigger.enabled}
        onCheckedChange={(v) => onSetEnabled(v)}
        aria-label={switchLabel}
        title={trigger.enabled ? t('enabledLabel') : t('paused')}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        aria-label={t('delete')}
        className="opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
