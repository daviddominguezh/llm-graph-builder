'use client';

import { createKvStoreAction } from '@/app/actions/kvStores';
import { createRagStoreAction } from '@/app/actions/ragStores';
import { Scrollable } from '@/app/components/Scrollable';
import type { KvStoreRow } from '@/app/lib/kvStores';
import type { RagStoreRow } from '@/app/lib/ragStores';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { CreateStoreDialog, type StoreType } from './CreateStoreDialog';
import { StoresSidebarGroup } from './StoresSidebarGroup';

interface StoresSidebarProps {
  orgId: string;
  orgSlug: string;
  initialRagStores: RagStoreRow[];
  initialKvStores: KvStoreRow[];
}

export function StoresSidebar({
  orgId,
  orgSlug,
  initialRagStores,
  initialKvStores,
}: StoresSidebarProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.storesSidebar');
  const router = useRouter();
  const pathname = usePathname();
  const [openType, setOpenType] = useState<StoreType | null>(null);
  const [ragStores, setRagStores] = useState(initialRagStores);
  const [kvStores, setKvStores] = useState(initialKvStores);

  const ragPrefix = `/orgs/${orgSlug}/knowledge-base/rag/`;
  const kvPrefix = `/orgs/${orgSlug}/knowledge-base/kv/`;
  const isRagActive = (slug: string) => pathname === `${ragPrefix}${slug}`;
  const isKvActive = (slug: string) => pathname === `${kvPrefix}${slug}`;

  async function handleCreate(name: string): Promise<{ ok: boolean; slug?: string; requestedSlug?: string }> {
    if (openType === 'rag') {
      const { result } = await createRagStoreAction(orgId, name);
      if (result === null) return { ok: false };
      setRagStores([result, ...ragStores]);
      router.push(`${ragPrefix}${result.slug}`);
      return { ok: true, slug: result.slug };
    }
    if (openType === 'kv') {
      const { result } = await createKvStoreAction(orgId, name);
      if (result === null) return { ok: false };
      setKvStores([result, ...kvStores]);
      router.push(`${kvPrefix}${result.slug}`);
      return { ok: true, slug: result.slug };
    }
    return { ok: false };
  }

  return (
    <aside className="w-56 shrink-0 border-r flex flex-col">
      <Scrollable className="min-h-0 flex-1">
        <div className="p-2 flex flex-col gap-3">
          <StoresSidebarGroup
            header={t('ragHeader')}
            items={ragStores}
            hrefFor={(slug) => `${ragPrefix}${slug}`}
            isActiveSlug={isRagActive}
            newLabel={t('newRag')}
            emptyLabel={t('empty')}
            onNewClick={() => setOpenType('rag')}
          />
          <StoresSidebarGroup
            header={t('kvHeader')}
            items={kvStores}
            hrefFor={(slug) => `${kvPrefix}${slug}`}
            isActiveSlug={isKvActive}
            newLabel={t('newKv')}
            emptyLabel={t('empty')}
            onNewClick={() => setOpenType('kv')}
          />
        </div>
      </Scrollable>
      <CreateStoreDialog
        type={openType ?? 'rag'}
        open={openType !== null}
        onOpenChange={(o) => {
          if (!o) setOpenType(null);
        }}
        onCreate={handleCreate}
      />
    </aside>
  );
}
