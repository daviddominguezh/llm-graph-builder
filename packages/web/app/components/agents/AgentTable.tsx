'use client';

import type { AgentMetadata } from '@/app/lib/agents';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AgentTableRow } from './AgentTableRow';
import { DeleteAgentDialog } from './DeleteAgentDialog';

interface AgentTableProps {
  agents: AgentMetadata[];
  orgSlug: string;
}

function TableHeader() {
  const t = useTranslations('agents');

  return (
    <thead>
      <tr className="border-b text-left text-xs text-muted-foreground">
        <th className="pb-2 font-medium">{t('name')}</th>
        <th className="pb-2 font-medium">{t('description')}</th>
        <th className="pb-2 font-medium">{t('version')}</th>
        <th className="pb-2 font-medium">{t('updated')}</th>
        <th className="pb-2 text-right font-medium">{t('actions')}</th>
      </tr>
    </thead>
  );
}

export function AgentTable({ agents, orgSlug }: AgentTableProps) {
  const [deleteTarget, setDeleteTarget] = useState<AgentMetadata | null>(null);

  return (
    <>
      <table className="w-full text-sm">
        <TableHeader />
        <tbody>
          {agents.map((agent) => (
            <AgentTableRow key={agent.id} agent={agent} orgSlug={orgSlug} onDelete={setDeleteTarget} />
          ))}
        </tbody>
      </table>
      <DeleteAgentDialog agent={deleteTarget} onOpenChange={() => setDeleteTarget(null)} />
    </>
  );
}
