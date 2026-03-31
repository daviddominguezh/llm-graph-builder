'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import type { AgentVfsSettings } from '@/app/actions/vfsConfig';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface VfsSettingsPanelProps {
  settings: AgentVfsSettings;
  onUpdate: (settings: AgentVfsSettings) => void;
}

/* ------------------------------------------------------------------ */
/*  Number field helper                                                */
/* ------------------------------------------------------------------ */

function NumberField({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | undefined;
  placeholder: string;
  onChange: (val: number | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={1}
        className="h-7 text-xs w-28"
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => {
          const num = Number(e.target.value);
          onChange(e.target.value === '' ? undefined : num);
        }}
      />
      <p className="text-[10px] text-muted-foreground/60 leading-tight">{hint}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function VfsSettingsPanel({ settings, onUpdate }: VfsSettingsPanelProps) {
  const t = useTranslations('vfsConfig');

  const handlePathsChange = useCallback(
    (value: string) => {
      const paths = value.split('\n').filter((line) => line.trim() !== '');
      onUpdate({ ...settings, protectedPaths: paths.length > 0 ? paths : undefined });
    },
    [settings, onUpdate]
  );

  const handleNumberChange = useCallback(
    (key: keyof AgentVfsSettings, value: number | undefined) => {
      onUpdate({ ...settings, [key]: value });
    },
    [settings, onUpdate]
  );

  return (
    <div className="flex flex-col gap-3 rounded-md border border-muted p-3">
      <div className="flex flex-col gap-1">
        <Label className="text-[11px] text-muted-foreground">{t('protectedPaths')}</Label>
        <Textarea
          className="text-xs min-h-16 font-mono"
          placeholder={t('protectedPathsDescription')}
          value={(settings.protectedPaths ?? []).join('\n')}
          onChange={(e) => handlePathsChange(e.target.value)}
        />
      </div>
      <div className="flex gap-4 flex-wrap">
        <NumberField
          label={t('searchCandidateLimit')}
          hint={t('searchCandidateLimitHint')}
          placeholder="200"
          value={settings.searchCandidateLimit}
          onChange={(v) => handleNumberChange('searchCandidateLimit', v)}
        />
        <NumberField
          label={t('readLineCeiling')}
          hint={t('readLineCeilingHint')}
          placeholder="10000"
          value={settings.readLineCeiling}
          onChange={(v) => handleNumberChange('readLineCeiling', v)}
        />
        <NumberField
          label={t('rateLimitThreshold')}
          hint={t('rateLimitThresholdHint')}
          placeholder="100"
          value={settings.rateLimitThreshold}
          onChange={(v) => handleNumberChange('rateLimitThreshold', v)}
        />
      </div>
    </div>
  );
}
