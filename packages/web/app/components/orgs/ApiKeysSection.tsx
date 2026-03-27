'use client';

import { getApiKeysByOrgAction } from '@/app/actions/apiKeys';
import type { ApiKeyRow } from '@/app/lib/apiKeys';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { CreateApiKeyDialog } from './CreateApiKeyDialog';
import { DeleteApiKeyDialog } from './DeleteApiKeyDialog';

interface ApiKeyItemProps {
  apiKey: ApiKeyRow;
  onDeleteClick: (key: ApiKeyRow) => void;
}

function ApiKeyItem({ apiKey, onDeleteClick }: ApiKeyItemProps) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-card">
      <span className="w-[200px] shrink-0 truncate text-sm font-medium font-mono mr-6">{apiKey.name}</span>
      <span className="flex-1 text-xs text-muted-foreground font-mono">{apiKey.key_preview}</span>
      <div className="flex items-center gap-1">
        <Button variant="destructive" onClick={() => onDeleteClick(apiKey)}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ApiKeysList({
  keys,
  onDeleteClick,
}: {
  keys: ApiKeyRow[];
  onDeleteClick: (key: ApiKeyRow) => void;
}) {
  const t = useTranslations('apiKeys');

  if (keys.length === 0) {
    return <p className="text-muted-foreground text-xs bg-card py-2 px-3 rounded-md">{t('noKeys')}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {keys.map((key) => (
        <ApiKeyItem key={key.id} apiKey={key} onDeleteClick={onDeleteClick} />
      ))}
    </div>
  );
}

interface ApiKeysSectionProps {
  orgId: string;
  initialKeys: ApiKeyRow[];
}

export function ApiKeysSection({ orgId, initialKeys }: ApiKeysSectionProps) {
  const t = useTranslations('apiKeys');
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyRow | null>(null);

  const refreshKeys = useCallback(async () => {
    const { result } = await getApiKeysByOrgAction(orgId);
    setKeys(result);
  }, [orgId]);

  return (
    <Card className="bg-background ring-0">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t('add')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ApiKeysList keys={keys} onDeleteClick={setDeleteTarget} />
      </CardContent>
      <CreateApiKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        onCreated={refreshKeys}
      />
      {deleteTarget !== null && (
        <DeleteApiKeyDialog
          open={deleteTarget !== null}
          onOpenChange={() => setDeleteTarget(null)}
          keyId={deleteTarget.id}
          keyName={deleteTarget.name}
          onDeleted={refreshKeys}
        />
      )}
    </Card>
  );
}
