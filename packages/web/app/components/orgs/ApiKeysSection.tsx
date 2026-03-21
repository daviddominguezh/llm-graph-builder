'use client';

import { getApiKeysByOrgAction } from '@/app/actions/api-keys';
import type { ApiKeyRow } from '@/app/lib/api-keys';
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
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{apiKey.name}</span>
        <span className="text-muted-foreground font-mono text-xs">{apiKey.key_preview}</span>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={() => onDeleteClick(apiKey)}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function ApiKeysList({ keys, onDeleteClick }: { keys: ApiKeyRow[]; onDeleteClick: (key: ApiKeyRow) => void }) {
  const t = useTranslations('apiKeys');

  if (keys.length === 0) {
    return <p className="text-muted-foreground text-xs bg-muted py-2 px-3 rounded-md">{t('noKeys')}</p>;
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
    <Card>
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
      <CreateApiKeyDialog open={createOpen} onOpenChange={setCreateOpen} orgId={orgId} onCreated={refreshKeys} />
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
