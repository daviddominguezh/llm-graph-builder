'use client';

import type { KvStoreRow } from '@/app/lib/kvStores';
import type { TenantRow } from '@/app/lib/tenants';

import { KvStoreTableConnected } from '../../KvStoreTableConnected';
import { TenantTabs } from '../../TenantTabs';

interface KvStorePageClientProps {
  store: KvStoreRow;
  tenants: TenantRow[];
}

export function KvStorePageClient({
  store,
  tenants,
}: KvStorePageClientProps): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6 pt-2 pb-4 min-h-0">
      <TenantTabs
        tenants={tenants}
        renderTab={(tenantId) => <KvStoreTableConnected storeId={store.id} tenantId={tenantId} />}
      />
    </div>
  );
}
