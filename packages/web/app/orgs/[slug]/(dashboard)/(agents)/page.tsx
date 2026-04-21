import { AgentEmptyState } from '@/app/components/agents/AgentEmptyState';
import { getCachedAgentsByOrg } from '@/app/lib/agents';
import { getOrgBySlug } from '@/app/lib/orgs';
import { Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { redirect } from 'next/navigation';

interface AgentsPageProps {
  params: Promise<{ slug: string }>;
}

function SelectAgentPrompt() {
  const t = useTranslations('agents');

  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="flex w-full max-w-3xl flex-col items-center gap-0 rounded-md bg-background px-4 py-8 text-center">
        <Zap className="size-6 text-muted-foreground/50" />
        <p className="text-sm font-medium mt-1">{t('selectAgent')}</p>
        <p className="text-xs text-muted-foreground max-w-sm">{t('selectAgentDescription')}</p>
      </div>
    </div>
  );
}

export default async function AgentsPage({ params }: AgentsPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: org } = await getOrgBySlug(slug);

  if (!org) {
    redirect('/');
  }

  const { agents } = await getCachedAgentsByOrg(org.id);

  if (agents.length === 0) {
    return <AgentEmptyState orgId={org.id} orgSlug={org.slug} />;
  }

  return <SelectAgentPrompt />;
}
