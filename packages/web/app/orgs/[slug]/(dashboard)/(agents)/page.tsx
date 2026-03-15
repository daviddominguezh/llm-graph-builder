import { useTranslations } from 'next-intl';
import { redirect } from 'next/navigation';

import { AgentEmptyState } from '@/app/components/agents/AgentEmptyState';
import { getCachedAgentsByOrg } from '@/app/lib/agents';
import { getOrgBySlug } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/server';

interface AgentsPageProps {
  params: Promise<{ slug: string }>;
}

function GraphIllustration() {
  return (
    <svg
      width="120"
      height="60"
      viewBox="0 0 120 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-muted-foreground/30"
    >
      <rect x="8" y="28" width="32" height="24" rx="6" stroke="currentColor" strokeWidth="1.5" />
      <rect x="44" y="28" width="32" height="24" rx="6" stroke="currentColor" strokeWidth="1.5" />
      <rect x="80" y="28" width="32" height="24" rx="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="40" r="3" fill="currentColor" className="text-primary/40" />
      <circle cx="60" cy="40" r="3" fill="currentColor" className="text-primary/40" />
      <circle cx="96" cy="40" r="3" fill="currentColor" className="text-primary/40" />
      <line x1="40" y1="40" x2="44" y2="40" stroke="currentColor" strokeWidth="1.5" className="text-primary/30" />
      <line x1="76" y1="40" x2="80" y2="40" stroke="currentColor" strokeWidth="1.5" className="text-primary/30" />
    </svg>
  );
}

function SelectAgentPrompt() {
  const t = useTranslations('agents');

  return (
    <div className="flex h-full flex-col items-center justify-center gap-0">
      <GraphIllustration />
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-lg font-medium text-foreground">{t('selectAgent')}</h2>
        <p className="max-w-xs text-center text-sm text-muted-foreground">{t('selectAgentDescription')}</p>
      </div>
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
