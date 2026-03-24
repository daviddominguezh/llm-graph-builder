import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { SessionsView } from '@/app/components/dashboard/SessionsView';
import { Separator } from '@/components/ui/separator';
import { getAgentsByOrg } from '@/app/lib/agents';
import { getSessionsByAgent } from '@/app/lib/dashboard';
import { getOrgBySlug } from '@/app/lib/orgs';

interface AgentSessionsPageProps {
  params: Promise<{ slug: string; agentSlug: string }>;
}

const DEFAULT_PAGE_SIZE = 50;

async function resolveAgent(orgId: string, agentSlug: string) {
  const { agents } = await getAgentsByOrg(orgId);
  return agents.find((a) => a.slug === agentSlug) ?? null;
}

export default async function AgentSessionsPage({ params }: AgentSessionsPageProps): Promise<React.JSX.Element> {
  const { slug, agentSlug } = await params;
  const { result: org } = await getOrgBySlug(slug);

  if (!org) {
    redirect('/');
  }

  const agent = await resolveAgent(org.id, agentSlug);

  if (!agent) {
    redirect(`/orgs/${slug}/dashboard`);
  }

  const t = await getTranslations('dashboard');

  const { rows, totalCount } = await getSessionsByAgent(org.id, agent.id, {
    page: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    sortKey: 'updated_at',
    sortDirection: 'desc',
  });

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="px-6 py-4 shrink-0 bg-background">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link href={`/orgs/${slug}/dashboard`} className="hover:text-foreground">
            {t('title')}
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-foreground font-medium">{agent.name}</span>
        </nav>
      </div>

      <Separator />

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <SessionsView
          orgId={org.id}
          agentId={agent.id}
          slug={slug}
          agentSlug={agentSlug}
          initialRows={rows}
          initialTotal={totalCount}
        />
      </div>
    </div>
  );
}
