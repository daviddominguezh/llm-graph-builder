'use client';

import { deleteRagStoreAction } from '@/app/actions/ragStores';
import type { RagStoreRow } from '@/app/lib/ragStores';
import type { TenantRow } from '@/app/lib/tenants';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useRef } from 'react';

import { AddFilesButton } from '../../AddFilesButton';
import { FileList } from '../../FileList';
import { KnowledgeBaseEmptyState } from '../../KnowledgeBaseEmptyState';
import { StoreHeader } from '../../StoreHeader';
import { TenantTabs } from '../../TenantTabs';
import { UploaderFooter } from '../../UploaderFooter';
import { ACCEPT_ATTR } from '../../uploaderHelpers';
import { useFileQueue } from '../../useFileQueue';

interface RagStorePageClientProps {
  orgSlug: string;
  store: RagStoreRow;
  tenants: TenantRow[];
}

function RagTenantContent(): React.JSX.Element {
  const t = useTranslations('knowledgeBase');
  const queue = useFileQueue();
  const inputRef = useRef<HTMLInputElement>(null);
  const isEmpty = queue.files.length === 0;

  function open() {
    inputRef.current?.click();
  }
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files !== null && e.target.files.length > 0) {
      queue.add(e.target.files);
      e.target.value = '';
    }
  }

  return (
    <Card className="bg-background ring-0 flex flex-1 flex-col">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        <CardAction>
          <AddFilesButton onAdd={open} kbdPressed={false} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {isEmpty ? (
          <KnowledgeBaseEmptyState isDragging={false} onAdd={open} />
        ) : (
          <FileList files={queue.files} onRemove={queue.remove} />
        )}
        {!isEmpty && <UploaderFooter files={queue.files} onClear={queue.clear} />}
      </CardContent>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        onChange={handleChange}
        className="hidden"
      />
    </Card>
  );
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
    <div className="flex flex-1 flex-col gap-4 p-6 min-h-0">
      <StoreHeader name={store.name} slug={store.slug} onDelete={handleDelete} />
      <TenantTabs
        tenants={tenants}
        renderTab={() => <RagTenantContent />}
      />
    </div>
  );
}
