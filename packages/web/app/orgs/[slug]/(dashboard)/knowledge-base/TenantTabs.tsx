'use client';

import { TenantAvatar } from '@/app/components/agents/channels/TenantAvatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TenantRow } from '@/app/lib/tenants';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface TenantTabsProps {
  tenants: TenantRow[];
  renderTab: (tenantId: string) => React.ReactNode;
}

export function TenantTabs({ tenants, renderTab }: TenantTabsProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.tenantTabs');
  const firstId = tenants[0]?.id ?? '';
  const [active, setActive] = useState(firstId);

  if (tenants.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        {t('noTenants')}
      </div>
    );
  }

  return (
    <Tabs value={active} onValueChange={setActive} className="flex flex-1 flex-col">
      <TabsList variant="line">
        {tenants.map((tenant) => (
          <TabsTrigger
            key={tenant.id}
            value={tenant.id}
            className="cursor-pointer pb-2 [&]:after:-bottom-3"
          >
            <span className="flex items-center gap-2">
              <TenantAvatar name={tenant.name} avatarUrl={tenant.avatar_url} />
              {tenant.name}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      {tenants.map((tenant) => (
        <TabsContent key={tenant.id} value={tenant.id} className="flex flex-1 flex-col">
          {tenant.id === active ? renderTab(tenant.id) : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}
