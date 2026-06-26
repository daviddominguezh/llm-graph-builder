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
import type { TriggerFormState } from './types';
import { DEFAULT_TRIGGER_STATE } from './types';
import { useTriggers } from './useTriggers';

interface TriggersPanelProps {
  orgId: string;
  orgSlug: string;
  agentId: string;
}

interface TenantsData {
  tenants: TenantRow[];
  loading: boolean;
  error: string | null;
}

const INITIAL_TENANTS: TenantsData = { tenants: [], loading: true, error: null };
const EMPTY_LIST = 0;
const FIRST_INDEX = 0;

type EditingState = { mode: 'add' };

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
  return <div className="flex flex-1 items-center justify-center text-xs text-destructive">{t('error')}</div>;
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

function ListLoadingState() {
  const t = useTranslations('editor.triggers');
  return (
    <div className="flex flex-1 items-center justify-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      <span>{t('listLoading')}</span>
    </div>
  );
}

function ListErrorState() {
  const t = useTranslations('editor.triggers');
  return (
    <div className="flex flex-1 items-center justify-center text-xs text-destructive">{t('listError')}</div>
  );
}

interface BodyProps {
  agentId: string;
  tenants: TenantRow[];
  tenantId: string;
  setTenantId: (id: string) => void;
}

function PanelBody({ agentId, tenants, tenantId, setTenantId }: BodyProps) {
  const { triggers, loading, error, addTrigger, deleteTrigger, setEnabled } = useTriggers(agentId, tenantId);
  const [editing, setEditing] = useState<EditingState | null>(null);

  const handleSave = (form: TriggerFormState) => {
    void addTrigger(form);
    setEditing(null);
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <TenantSidebar tenants={tenants} currentTenantId={tenantId} onSelect={setTenantId} />
      {loading ? (
        <ListLoadingState />
      ) : error !== null ? (
        <ListErrorState />
      ) : (
        <TriggersListView
          triggers={triggers}
          onAdd={() => setEditing({ mode: 'add' })}
          onSetEnabled={(id, enabled) => void setEnabled(id, enabled)}
          onDelete={(id) => void deleteTrigger(id)}
        />
      )}
      <TriggerFormDialog
        open={editing !== null}
        isEdit={false}
        initial={DEFAULT_TRIGGER_STATE}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={handleSave}
      />
    </div>
  );
}

export function TriggersPanel({ orgId, orgSlug, agentId }: TriggersPanelProps) {
  const [tenantId, setTenantId] = useState<string>('');
  const { tenants, loading, error } = useTenants(orgId);
  useDefaultTenant(tenants, tenantId, setTenantId);

  if (loading) return <LoadingState />;
  if (error !== null) return <ErrorState />;
  if (tenants.length === EMPTY_LIST) return <EmptyTenantsState orgSlug={orgSlug} />;

  return <PanelBody agentId={agentId} tenants={tenants} tenantId={tenantId} setTenantId={setTenantId} />;
}
