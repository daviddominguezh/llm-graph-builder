'use client';

import type { ApiKeyRow } from '@/app/lib/api-keys';
import { getApiKeysByOrg } from '@/app/lib/api-keys';
import { createClient } from '@/app/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { CreateApiKeyDialog } from './CreateApiKeyDialog';
import { DeleteApiKeyDialog } from './DeleteApiKeyDialog';

const MASK_VISIBLE_CHARS = 4;
const MASK_PREFIX = '••••••••';

function maskKeyValue(keyValue: string): string {
  return MASK_PREFIX + keyValue.slice(-MASK_VISIBLE_CHARS);
}

interface ApiKeyItemProps {
  apiKey: ApiKeyRow;
  onDeleteClick: (key: ApiKeyRow) => void;
}

function ApiKeyItem({ apiKey, onDeleteClick }: ApiKeyItemProps) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{apiKey.name}</span>
        <span className="text-muted-foreground font-mono text-xs">{maskKeyValue(apiKey.key_value)}</span>
      </div>
      <Button variant="ghost" size="icon" onClick={() => onDeleteClick(apiKey)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface ApiKeysListProps {
  keys: ApiKeyRow[];
  onDeleteClick: (key: ApiKeyRow) => void;
}

function ApiKeysList({ keys, onDeleteClick }: ApiKeysListProps) {
  if (keys.length === 0) return null;

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
    const supabase = createClient();
    const { result } = await getApiKeysByOrg(supabase, orgId);
    setKeys(result);
  }, [orgId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>{t('title')}</Label>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          {t('add')}
        </Button>
      </div>
      <ApiKeysList keys={keys} onDeleteClick={setDeleteTarget} />
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
    </div>
  );
}
