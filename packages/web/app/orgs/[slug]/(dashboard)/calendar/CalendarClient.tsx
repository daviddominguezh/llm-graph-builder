'use client';

import { TenantSidebar } from '@/app/components/orgs/tenants/TenantSidebar';
import type { TenantRow } from '@/app/lib/tenants';
import { useState } from 'react';

import { CalendarView } from './CalendarView';

interface CalendarClientProps {
  tenants: TenantRow[];
  defaultTenantId: string;
}

export function CalendarClient({ tenants, defaultTenantId }: CalendarClientProps): React.JSX.Element {
  const [tenantId, setTenantId] = useState(defaultTenantId);
  const hasTenants = tenants.length > 0;

  return (
    <div className="relative flex h-[calc(100%-var(--spacing)*2.5)] overflow-hidden border mr-2.5 rounded-xl bg-background">
      {hasTenants ? (
        <TenantSidebar tenants={tenants} currentTenantId={tenantId} onSelect={setTenantId} />
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden p-6">
        <CalendarView />
      </div>
    </div>
  );
}
