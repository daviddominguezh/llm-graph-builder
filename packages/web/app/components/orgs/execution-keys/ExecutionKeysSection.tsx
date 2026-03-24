'use client';

import { getAgentsForKeyAction, getExecutionKeysByOrgAction } from '@/app/actions/execution-keys';
import type { AgentMetadata } from '@/app/lib/agents';
import type { ExecutionKeyRow as ExecutionKeyRowType, ExecutionKeyWithAgents } from '@/app/lib/execution-keys';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { CreateExecutionKeyDialog } from './CreateExecutionKeyDialog';
import { DeleteExecutionKeyDialog } from './DeleteExecutionKeyDialog';
import { ExecutionKeyRow } from './ExecutionKeyRow';
import { KeyRevealDialog } from './KeyRevealDialog';

interface ExecutionKeysSectionProps {
  orgId: string;
  initialKeys: ExecutionKeyWithAgents[];
  agents: AgentMetadata[];
}

interface DeleteTarget {
  id: string;
  name: string;
}

async function fetchAgentsForKeys(keys: ExecutionKeyRowType[]): Promise<ExecutionKeyWithAgents[]> {
  const results = await Promise.all(
    keys.map(async (key) => {
      const { result: agents } = await getAgentsForKeyAction(key.id);
      return { ...key, agents };
    })
  );
  return results;
}

function EmptyState() {
  const t = useTranslations('executionKeys');
  return <p className="bg-input text-muted-foreground rounded-md px-3 py-2 text-xs">{t('noKeys')}</p>;
}

function KeysList({
  keys,
  onDelete,
}: {
  keys: ExecutionKeyWithAgents[];
  onDelete: (id: string, name: string) => void;
}) {
  if (keys.length === 0) return <EmptyState />;

  return (
    <div className="flex flex-col gap-2">
      {keys.map((key) => (
        <ExecutionKeyRow key={key.id} keyData={key} onDelete={onDelete} />
      ))}
    </div>
  );
}

function useExecutionKeysState(orgId: string, initialKeys: ExecutionKeyWithAgents[]) {
  const [keys, setKeys] = useState<ExecutionKeyWithAgents[]>(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const refreshKeys = useCallback(async () => {
    const { result } = await getExecutionKeysByOrgAction(orgId);
    const keysWithAgents = await fetchAgentsForKeys(result);
    setKeys(keysWithAgents);
  }, [orgId]);

  return {
    keys,
    createOpen,
    setCreateOpen,
    revealKey,
    setRevealKey,
    deleteTarget,
    setDeleteTarget,
    refreshKeys,
  };
}

function SectionHeader({ onCreateClick }: { onCreateClick: () => void }) {
  const t = useTranslations('executionKeys');

  return (
    <CardHeader>
      <CardTitle>{t('title')}</CardTitle>
      <CardDescription>{t('description')}</CardDescription>
      <CardAction>
        <Button variant="outline" size="sm" onClick={onCreateClick}>
          <Plus className="size-4" />
          {t('add')}
        </Button>
      </CardAction>
    </CardHeader>
  );
}

export function ExecutionKeysSection({ orgId, initialKeys, agents }: ExecutionKeysSectionProps) {
  const state = useExecutionKeysState(orgId, initialKeys);

  function handleCreated(result: { key: ExecutionKeyRowType; fullKey: string }) {
    state.setRevealKey(result.fullKey);
    state.setCreateOpen(false);
  }

  function handleRevealClose() {
    state.setRevealKey(null);
    void state.refreshKeys();
  }

  function handleDelete(id: string, name: string) {
    state.setDeleteTarget({ id, name });
  }

  function handleDeleted() {
    state.setDeleteTarget(null);
    void state.refreshKeys();
  }

  return (
    <Card>
      <SectionHeader onCreateClick={() => state.setCreateOpen(true)} />
      <CardContent>
        <KeysList keys={state.keys} onDelete={handleDelete} />
      </CardContent>
      <CreateExecutionKeyDialog
        open={state.createOpen}
        onOpenChange={state.setCreateOpen}
        orgId={orgId}
        agents={agents}
        onCreated={handleCreated}
      />
      {state.revealKey !== null && (
        <KeyRevealDialog open={state.revealKey !== null} onOpenChange={handleRevealClose} fullKey={state.revealKey} />
      )}
      {state.deleteTarget !== null && (
        <DeleteExecutionKeyDialog
          open={state.deleteTarget !== null}
          onOpenChange={() => state.setDeleteTarget(null)}
          keyId={state.deleteTarget.id}
          keyName={state.deleteTarget.name}
          onDeleted={handleDeleted}
        />
      )}
    </Card>
  );
}
