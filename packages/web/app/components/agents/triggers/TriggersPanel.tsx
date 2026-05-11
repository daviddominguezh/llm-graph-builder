'use client';

import { getTenantsByOrgAction } from '@/app/actions/tenants';
import { TenantSidebar } from '@/app/components/orgs/tenants/TenantSidebar';
import { Scrollable } from '@/app/components/Scrollable';
import type { TenantRow } from '@/app/lib/tenants';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ModeSelector } from './ModeSelector';
import { NextRunPreview } from './NextRunPreview';
import { OnceField } from './OnceField';
import { RecurringFields } from './RecurringFields';
import type { TriggerFormState } from './types';
import { DEFAULT_TRIGGER_STATE } from './types';

interface TriggersPanelProps {
  orgId: string;
  orgSlug: string;
}

interface SectionProps {
  state: TriggerFormState;
  setState: (next: TriggerFormState) => void;
}

interface TenantsData {
  tenants: TenantRow[];
  loading: boolean;
  error: string | null;
}

const INITIAL_TENANTS: TenantsData = { tenants: [], loading: true, error: null };
const EMPTY_LIST = 0;
const FIRST_INDEX = 0;

interface TenantsState {
  forOrgId: string;
  data: TenantsData;
}

function useTenants(orgId: string): TenantsData {
  const [state, setState] = useState<TenantsState>({ forOrgId: orgId, data: INITIAL_TENANTS });
  useEffect(() => {
    let cancelled = false;
    void getTenantsByOrgAction(orgId).then(({ result, error }) => {
      if (cancelled) return;
      setState({ forOrgId: orgId, data: { tenants: result, loading: false, error } });
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);
  return state.forOrgId === orgId ? state.data : INITIAL_TENANTS;
}

function useDefaultTenant(tenants: TenantRow[], selected: string, setSelected: (id: string) => void): void {
  useEffect(() => {
    if (selected !== '') return;
    if (tenants.length === EMPTY_LIST) return;
    const first = tenants[FIRST_INDEX];
    if (first) setSelected(first.id);
  }, [tenants, selected, setSelected]);
}

function TriggersHeader() {
  const t = useTranslations('editor.triggers');
  return (
    <header className="flex flex-col gap-1">
      <h2 className="text-sm font-semibold tracking-tight">{t('title')}</h2>
      <p className="text-xs text-muted-foreground">{t('description')}</p>
    </header>
  );
}

function AfterEventNote() {
  const t = useTranslations('editor.triggers');
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
      {t('afterEventComingSoon')}
    </div>
  );
}

function PreviewSection({ state }: { state: TriggerFormState }) {
  if (state.mode === 'after-event') return null;
  return (
    <div className="flex flex-col gap-3">
      <Separator />
      <NextRunPreview state={state} />
    </div>
  );
}

function ActiveModeContent({ state, setState }: SectionProps) {
  if (state.mode === 'recurring') {
    return (
      <RecurringFields value={state.recurring} onChange={(recurring) => setState({ ...state, recurring })} />
    );
  }
  if (state.mode === 'once') {
    return (
      <OnceField
        value={state.onceDateTime}
        onChange={(onceDateTime) => setState({ ...state, onceDateTime })}
      />
    );
  }
  return <AfterEventNote />;
}

function ActiveModePanel({ state, setState }: SectionProps) {
  return (
    <div
      key={state.mode}
      className="animate-in fade-in slide-in-from-top-1 duration-200 ease-out motion-reduce:animate-none"
    >
      <ActiveModeContent state={state} setState={setState} />
    </div>
  );
}

function LoadingState() {
  const t = useTranslations('editor.triggers.picker');
  return (
    <div className="flex flex-1 items-center justify-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      <span>{t('loading')}</span>
    </div>
  );
}

function ErrorState() {
  const t = useTranslations('editor.triggers.picker');
  return (
    <div className="flex flex-1 items-center justify-center text-xs text-destructive">{t('error')}</div>
  );
}

function EmptyState({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations('editor.triggers.picker');
  return (
    <div className="flex flex-1 items-center justify-center gap-1.5 text-xs text-muted-foreground">
      <span>{t('emptyLabel')}</span>
      <Link
        href={`/orgs/${orgSlug}/tenants`}
        className="font-medium text-foreground underline-offset-2 hover:underline"
      >
        {t('emptyCta')}
      </Link>
    </div>
  );
}

function TriggersContent({ state, setState }: SectionProps) {
  return (
    <Scrollable className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
        <div className="flex flex-col gap-3">
          <TriggersHeader />
          <ModeSelector value={state.mode} onChange={(mode) => setState({ ...state, mode })} />
        </div>
        <ActiveModePanel state={state} setState={setState} />
        <PreviewSection state={state} />
      </div>
    </Scrollable>
  );
}

export function TriggersPanel({ orgId, orgSlug }: TriggersPanelProps) {
  const [state, setState] = useState<TriggerFormState>(DEFAULT_TRIGGER_STATE);
  const [tenantId, setTenantId] = useState<string>('');
  const { tenants, loading, error } = useTenants(orgId);
  useDefaultTenant(tenants, tenantId, setTenantId);

  if (loading) return <LoadingState />;
  if (error !== null) return <ErrorState />;
  if (tenants.length === EMPTY_LIST) return <EmptyState orgSlug={orgSlug} />;

  return (
    <div className="flex flex-1 overflow-hidden">
      <TenantSidebar tenants={tenants} currentTenantId={tenantId} onSelect={setTenantId} />
      <TriggersContent state={state} setState={setState} />
    </div>
  );
}
