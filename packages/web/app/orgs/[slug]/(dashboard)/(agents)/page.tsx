import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { redirect } from 'next/navigation';

import { AgentEmptyState } from '@/app/components/agents/AgentEmptyState';
import { getCachedAgentsByOrg } from '@/app/lib/agents';
import { getOrgBySlug } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/server';

interface AgentsPageProps {
  params: Promise<{ slug: string }>;
}

function SelectAgentPrompt() {
  const t = useTranslations('agents');

  return (
    <div className="flex h-full items-center justify-center gap-2 text-muted-foreground/50">
      <ArrowLeft className="size-5" />
      <p className="text-sm">{t('selectAgent')}</p>
    </div>
  );
}

export default async function AgentsPage({ params }: AgentsPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const supabase = await createClient();
  const { result: org } = await getOrgBySlug(supabase, slug);

  if (!org) {
    redirect('/');
  }

  const { agents } = await getCachedAgentsByOrg(supabase, org.id);

  if (agents.length === 0) {
    return <AgentEmptyState orgId={org.id} orgSlug={org.slug} />;
  }

  return <SelectAgentPrompt />;
}
