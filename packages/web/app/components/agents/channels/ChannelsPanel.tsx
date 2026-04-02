'use client';

import { getTenantsByOrgAction } from '@/app/actions/tenants';
import type { TenantRow } from '@/app/lib/tenants';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { ChannelsEmptyState } from './ChannelsEmptyState';
import { ChannelsTable } from './ChannelsTable';

interface ChannelsPanelProps {
  orgId: string;
}

interface TenantsData {
  tenants: TenantRow[];
  loading: boolean;
  error: string | null;
}

function fetchAndSetTenants(orgId: string, setData: (val: TenantsData) => void): void {
  void getTenantsByOrgAction(orgId).then(({ result, error }) => {
    setData({ tenants: result, loading: false, error });
  });
}

function LoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-sm text-destructive">{message}</p>
    </div>
  );
}

export function ChannelsPanel({ orgId }: ChannelsPanelProps) {
  const t = useTranslations('editor.channels');
  const [data, setData] = useState<TenantsData>({ tenants: [], loading: true, error: null });

  useEffect(() => {
    fetchAndSetTenants(orgId, setData);
  }, [orgId]);

  if (data.loading) return <LoadingSpinner />;
  if (data.error !== null) return <ErrorMessage message={t('loadError', { error: data.error })} />;
  if (data.tenants.length === 0) return <ChannelsEmptyState />;

  return (
    <div className="flex-1 overflow-auto p-4">
      <ChannelsTable tenants={data.tenants} />
    </div>
  );
}
