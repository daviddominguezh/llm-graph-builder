'use client';

import { getTenantsByOrgAction } from '@/app/actions/tenants';
import { TenantSidebar } from '@/app/components/orgs/tenants/TenantSidebar';
import type { TenantRow } from '@/app/lib/tenants';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { TriggerFormDialog } from './TriggerFormDialog';
import { TriggersListView } from './TriggersListView';
import type { Trigger, TriggerFormState } from './types';
import { DEFAULT_TRIGGER_STATE } from './types';
import { useTriggers } from './useTriggers';

interface TriggersPanelProps {
  orgId: string;
  orgSlug: string;
}

interface TenantsData {
  tenants: TenantRow[];
  loading: boolean;
  error: string | null;
}

const INITIAL_TENANTS: TenantsData = { tenants: [], loading: true, error: null };
const EMPTY_LIST = 0;
const FIRST_INDEX = 0;

type EditingState = { mode: 'add' } | { mode: 'edit'; id: string };

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

function EmptyTenantsState({ orgSlug }: { orgSlug: string }) {
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

function stripId(trigger: Trigger): TriggerFormState {
  return {
    mode: trigger.mode,
    recurring: trigger.recurring,
    onceDateTime: trigger.onceDateTime,
  };
}

function getInitialForm(editing: EditingState, triggers: Trigger[]): TriggerFormState {
  if (editing.mode === 'add') return DEFAULT_TRIGGER_STATE;
  const target = triggers.find((t) => t.id === editing.id);
  return target ? stripId(target) : DEFAULT_TRIGGER_STATE;
}

interface BodyProps {
  tenants: TenantRow[];
  tenantId: string;
  setTenantId: (id: string) => void;
}

function PanelBody({ tenants, tenantId, setTenantId }: BodyProps) {
  const { triggers, addTrigger, updateTrigger, deleteTrigger } = useTriggers(tenantId);
  const [editing, setEditing] = useState<EditingState | null>(null);

  const handleSave = (form: TriggerFormState) => {
    if (editing?.mode === 'add') addTrigger(form);
    else if (editing?.mode === 'edit') updateTrigger(editing.id, form);
    setEditing(null);
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <TenantSidebar tenants={tenants} currentTenantId={tenantId} onSelect={setTenantId} />
      <TriggersListView
        triggers={triggers}
        onAdd={() => setEditing({ mode: 'add' })}
        onEdit={(id) => setEditing({ mode: 'edit', id })}
        onDelete={deleteTrigger}
      />
      <TriggerFormDialog
        open={editing !== null}
        isEdit={editing?.mode === 'edit'}
        initial={editing ? getInitialForm(editing, triggers) : DEFAULT_TRIGGER_STATE}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={handleSave}
      />
    </div>
  );
}

export function TriggersPanel({ orgId, orgSlug }: TriggersPanelProps) {
  const [tenantId, setTenantId] = useState<string>('');
  const { tenants, loading, error } = useTenants(orgId);
  useDefaultTenant(tenants, tenantId, setTenantId);

  if (loading) return <LoadingState />;
  if (error !== null) return <ErrorState />;
  if (tenants.length === EMPTY_LIST) return <EmptyTenantsState orgSlug={orgSlug} />;

  return <PanelBody tenants={tenants} tenantId={tenantId} setTenantId={setTenantId} />;
}
