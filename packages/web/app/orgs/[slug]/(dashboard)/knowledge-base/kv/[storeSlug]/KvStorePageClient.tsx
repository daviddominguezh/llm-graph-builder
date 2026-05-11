'use client';

import { deleteKvStoreAction } from '@/app/actions/kvStores';
import type { KvStoreRow } from '@/app/lib/kvStores';
import type { TenantRow } from '@/app/lib/tenants';
import { useRouter } from 'next/navigation';

import { KvStoreTableConnected } from '../../KvStoreTableConnected';
import { StoreHeader } from '../../StoreHeader';
import { TenantTabs } from '../../TenantTabs';

interface KvStorePageClientProps {
  orgSlug: string;
  store: KvStoreRow;
  tenants: TenantRow[];
}

export function KvStorePageClient({
  orgSlug,
  store,
  tenants,
}: KvStorePageClientProps): React.JSX.Element {
  const router = useRouter();

  async function handleDelete() {
    await deleteKvStoreAction(store.id);
    router.push(`/orgs/${orgSlug}/knowledge-base`);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6 min-h-0">
      <StoreHeader name={store.name} slug={store.slug} onDelete={handleDelete} />
      <TenantTabs
        tenants={tenants}
        renderTab={(tenantId) => <KvStoreTableConnected storeId={store.id} tenantId={tenantId} />}
      />
    </div>
  );
}
