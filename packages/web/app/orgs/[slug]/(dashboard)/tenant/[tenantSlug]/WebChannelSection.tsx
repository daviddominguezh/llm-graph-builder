'use client';

import { parseAllowedOriginEntry } from '@openflow/shared-validation';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useState } from 'react';
import { toast } from 'sonner';

import { updateTenantWebChannelAction } from '@/app/actions/tenants';
import type { TenantRow } from '@/app/lib/tenants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface WebChannelSectionProps {
  tenant: TenantRow;
}

function useWebChannelState(tenant: TenantRow) {
  const [enabled, setEnabled] = useState(tenant.web_channel_enabled);
  const [origins, setOrigins] = useState<string[]>(tenant.web_channel_allowed_origins);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return {
    enabled,
    setEnabled,
    origins,
    setOrigins,
    draft,
    setDraft,
    draftError,
    setDraftError,
    saving,
    setSaving,
  };
}

function useSave(tenant: TenantRow, onSaved: () => void) {
  const t = useTranslations('tenants');
  return useCallback(
    async (
      enabled: boolean,
      origins: string[],
      setSaving: (v: boolean) => void
    ): Promise<boolean> => {
      setSaving(true);
      const { error } = await updateTenantWebChannelAction(tenant.id, {
        enabled,
        allowedOrigins: origins,
      });
      setSaving(false);
      if (error !== null) {
        toast.error(t('updateError'));
        return false;
      }
      onSaved();
      return true;
    },
    [tenant.id, t, onSaved]
  );
}

interface OriginListProps {
  origins: string[];
  onRemove: (idx: number) => void;
  removeLabel: string;
  emptyLabel: string;
}

function OriginList({ origins, onRemove, removeLabel, emptyLabel }: OriginListProps) {
  if (origins.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-1 py-2">{emptyLabel}</p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {origins.map((origin, idx) => (
        <li
          key={`${origin}-${String(idx)}`}
          className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-1.5 font-mono text-xs dark:bg-input/30"
        >
          <span className="min-w-0 truncate">{origin}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={removeLabel}
            onClick={() => onRemove(idx)}
            className="h-7 w-7 p-0"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

interface AddOriginInputProps {
  draft: string;
  setDraft: (v: string) => void;
  draftError: string | null;
  setDraftError: (v: string | null) => void;
  onAdd: (entry: string) => void;
  placeholder: string;
  addLabel: string;
  invalidLabel: string;
  duplicateLabel: string;
  origins: string[];
}

function AddOriginInput({
  draft,
  setDraft,
  draftError,
  setDraftError,
  onAdd,
  placeholder,
  addLabel,
  invalidLabel,
  duplicateLabel,
  origins,
}: AddOriginInputProps) {
  function commit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const normalized = draft.trim().replace(/\/+$/u, '');
    if (normalized === '') return;
    if (parseAllowedOriginEntry(normalized) === null) {
      setDraftError(invalidLabel);
      return;
    }
    if (origins.includes(normalized)) {
      setDraftError(duplicateLabel);
      return;
    }
    setDraftError(null);
    setDraft('');
    onAdd(normalized);
  }
  return (
    <form onSubmit={commit} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (draftError !== null) setDraftError(null);
          }}
          placeholder={placeholder}
          className="flex-1 font-mono text-xs"
        />
        <Button type="submit" variant="outline" size="sm" className="border-[0.5px] rounded-md">
          <Plus className="size-3.5" />
          {addLabel}
        </Button>
      </div>
      {draftError !== null ? <p className="text-xs text-destructive">{draftError}</p> : null}
    </form>
  );
}

export function WebChannelSection({ tenant }: WebChannelSectionProps): React.JSX.Element {
  const t = useTranslations('tenants.webChannel');
  const router = useRouter();
  const state = useWebChannelState(tenant);
  const save = useSave(tenant, () => router.refresh());

  async function handleToggle(next: boolean): Promise<void> {
    state.setEnabled(next);
    await save(next, state.origins, state.setSaving);
  }
  async function handleAdd(entry: string): Promise<void> {
    const next = [...state.origins, entry];
    state.setOrigins(next);
    await save(state.enabled, next, state.setSaving);
  }
  async function handleRemove(idx: number): Promise<void> {
    const next = state.origins.filter((_, i) => i !== idx);
    state.setOrigins(next);
    await save(state.enabled, next, state.setSaving);
  }

  return (
    <Card className="bg-transparent ring-0 border-transparent">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-md border px-3 py-2.5 bg-card dark:bg-input/30">
          <div className="flex flex-col gap-0.5">
            <Label className="text-sm">{t('toggleLabel')}</Label>
            <p className="text-xs text-muted-foreground">{t('toggleHint')}</p>
          </div>
          <Switch
            checked={state.enabled}
            onCheckedChange={(v) => void handleToggle(v)}
            disabled={state.saving}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-sm">{t('originsLabel')}</Label>
          <OriginList
            origins={state.origins}
            onRemove={(idx) => void handleRemove(idx)}
            removeLabel={t('remove')}
            emptyLabel={t('empty')}
          />
          <AddOriginInput
            draft={state.draft}
            setDraft={state.setDraft}
            draftError={state.draftError}
            setDraftError={state.setDraftError}
            onAdd={(entry) => void handleAdd(entry)}
            placeholder={t('inputPlaceholder')}
            addLabel={t('add')}
            invalidLabel={t('invalidEntry')}
            duplicateLabel={t('duplicateEntry')}
            origins={state.origins}
          />
        </div>
      </CardContent>
    </Card>
  );
}
