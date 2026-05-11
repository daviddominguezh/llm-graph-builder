'use client';

import { deleteRagStoreAction } from '@/app/actions/ragStores';
import type { RagStoreRow } from '@/app/lib/ragStores';
import type { TenantRow } from '@/app/lib/tenants';
import { useRouter } from 'next/navigation';

import { StoreHeader } from '../../StoreHeader';
import { TenantTabs } from '../../TenantTabs';
import { RagTenantContent } from './RagTenantContent';

interface RagStorePageClientProps {
  orgSlug: string;
  store: RagStoreRow;
  tenants: TenantRow[];
}

export function RagStorePageClient({
  orgSlug,
  store,
  tenants,
}: RagStorePageClientProps): React.JSX.Element {
  const router = useRouter();

  async function handleDelete() {
    await deleteRagStoreAction(store.id);
    router.push(`/orgs/${orgSlug}/knowledge-base`);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6 pt-2 pb-4 min-h-0">
      <StoreHeader name={store.name} slug={store.slug} onDelete={handleDelete} />
      <TenantTabs
        tenants={tenants}
        renderTab={(tenantId) => <RagTenantContent storeId={store.id} tenantId={tenantId} />}
      />
    </div>
  );
}
