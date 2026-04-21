'use client';

import MessagesDashboard from '@/app/components/messages';
import type { TenantRow } from '@/app/lib/tenants';
import { useCallback, useState } from 'react';

interface ChatsClientProps {
  tenants: TenantRow[];
  defaultTenantId: string;
}

export function ChatsClient({ tenants, defaultTenantId }: ChatsClientProps): React.JSX.Element {
  const [tenantId, setTenantId] = useState(defaultTenantId);

  const handleSidebarChange = useCallback(() => {
    /* sidebar managed by OrgSidebar */
  }, []);

  const handleTenantChange = useCallback((id: string) => {
    setTenantId(id);
  }, []);

  return (
    <div className="flex h-[calc(100%-var(--spacing)*2)] flex-col overflow-hidden border mr-2 rounded-xl">
      <div className="min-h-0 flex-1">
        <MessagesDashboard
          onChangeSidebar={handleSidebarChange}
          tenantId={tenantId}
          tenants={tenants}
          onTenantChange={handleTenantChange}
        />
      </div>
    </div>
  );
}
