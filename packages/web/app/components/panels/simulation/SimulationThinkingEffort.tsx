'use client';

import { Switch } from '@/components/ui/switch';
import { useTranslations } from 'next-intl';

export type ThinkingEffort = 'none' | 'low' | 'medium' | 'high';

interface SimulationThinkingEffortProps {
  value: ThinkingEffort;
  onValueChange: (value: ThinkingEffort) => void;
}

export function SimulationThinkingEffort({ value, onValueChange }: SimulationThinkingEffortProps) {
  const t = useTranslations('simulation');
  const enabled = value === 'high';

  const handleToggle = (checked: boolean) => {
    onValueChange(checked ? 'high' : 'none');
  };

  return (
    <label className="flex items-center gap-3 rounded-lg px-0.5 py-0.5 justify-between">
      <div className="min-w-0">
        <div className="text-xs font-medium">{t('extendedThinking')}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">{t('extendedThinkingDescription')}</div>
      </div>
      <Switch checked={enabled} onCheckedChange={handleToggle} />
    </label>
  );
}
