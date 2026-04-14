'use client';

import { useCallback, useState } from 'react';

import MessagesDashboard from '@/app/components/messages';
import type { TenantRow } from '@/app/lib/tenants';

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
    <div className="flex h-full flex-col overflow-hidden border mr-1.5 rounded-xl">
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
