'use client';

import { useCallback, useState } from 'react';

import MessagesDashboard from '@/app/components/messages';
import type { TenantRow } from '@/app/lib/tenants';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useTranslations } from 'next-intl';

interface ChatsClientProps {
  tenants: TenantRow[];
  defaultTenantId: string;
}

export function ChatsClient({ tenants, defaultTenantId }: ChatsClientProps): React.JSX.Element {
  const t = useTranslations('chats');
  const [tenantId, setTenantId] = useState(defaultTenantId);
  const showSelector = tenants.length > 1;

  const handleSidebarChange = useCallback(() => {
    /* sidebar managed by OrgSidebar */
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {showSelector && (
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <span className="text-muted-foreground text-xs">{t('tenant')}</span>
          <Select value={tenantId} onValueChange={(v) => v && setTenantId(v)}>
            <SelectTrigger className="h-7 w-48 text-xs">{selectedTenantLabel(tenants, tenantId)}</SelectTrigger>
            <SelectContent>
              {tenants.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <MessagesDashboard onChangeSidebar={handleSidebarChange} tenantId={tenantId} />
      </div>
    </div>
  );
}

function selectedTenantLabel(tenants: TenantRow[], id: string): string {
  const match = tenants.find((t) => t.id === id);
  return match?.name ?? id;
}
