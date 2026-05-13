'use client';

import type { RagStoreRow } from '@/app/lib/ragStores';
import type { TenantRow } from '@/app/lib/tenants';

import { TenantTabs } from '../../TenantTabs';
import { RagTenantContent } from './RagTenantContent';

interface RagStorePageClientProps {
  store: RagStoreRow;
  tenants: TenantRow[];
}

export function RagStorePageClient({
  store,
  tenants,
}: RagStorePageClientProps): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col gap-4 px-0 pt-0 pb-0 min-h-0">
      <TenantTabs
        tenants={tenants}
        renderTab={(tenantId) => <RagTenantContent storeId={store.id} tenantId={tenantId} />}
      />
    </div>
  );
}
