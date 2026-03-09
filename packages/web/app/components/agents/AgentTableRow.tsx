'use client';

import type { AgentMetadata } from '@/app/lib/agents';
import { formatRelativeTime } from '@/app/utils/formatRelativeTime';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface AgentTableRowProps {
  agent: AgentMetadata;
  orgSlug: string;
  onDelete: (agent: AgentMetadata) => void;
}

function AgentActions({ agent, orgSlug, onDelete }: AgentTableRowProps) {
  const t = useTranslations('agents');

  return (
    <td className="py-2 text-right">
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href={`/orgs/${orgSlug}/editor/${agent.slug}`} />}
          aria-label={t('edit')}
        >
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => onDelete(agent)} aria-label={t('delete')}>
          <Trash2 />
        </Button>
      </div>
    </td>
  );
}

export function AgentTableRow({ agent, orgSlug, onDelete }: AgentTableRowProps) {
  return (
    <tr className="border-b">
      <td className="py-2 font-medium">
        <Link href={`/orgs/${orgSlug}/editor/${agent.slug}`} className="hover:underline">
          {agent.name}
        </Link>
      </td>
      <td className="text-muted-foreground py-2">{agent.description}</td>
      <td className="py-2">v{agent.version}</td>
      <td className="text-muted-foreground py-2">{formatRelativeTime(agent.updated_at)}</td>
      <AgentActions agent={agent} orgSlug={orgSlug} onDelete={onDelete} />
    </tr>
  );
}
