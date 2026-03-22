import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { SessionBreadcrumb } from '@/app/components/dashboard/SessionBreadcrumb';
import { SessionsView } from '@/app/components/dashboard/SessionsView';
import { getAgentsByOrg } from '@/app/lib/agents';
import { getSessionsByAgent } from '@/app/lib/dashboard';
import { getOrgBySlug } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/server';

interface AgentSessionsPageProps {
  params: Promise<{ slug: string; agentSlug: string }>;
}

const DEFAULT_PAGE_SIZE = 50;

async function resolveAgent(supabase: ReturnType<typeof createClient> extends Promise<infer R> ? R : never, orgId: string, agentSlug: string) {
  const { agents } = await getAgentsByOrg(supabase, orgId);
  return agents.find((a) => a.slug === agentSlug) ?? null;
}

export default async function AgentSessionsPage({ params }: AgentSessionsPageProps): Promise<React.JSX.Element> {
  const { slug, agentSlug } = await params;
  const supabase = await createClient();
  const { result: org } = await getOrgBySlug(supabase, slug);

  if (!org) {
    redirect('/');
  }

  const agent = await resolveAgent(supabase, org.id, agentSlug);

  if (!agent) {
    redirect(`/orgs/${slug}/dashboard`);
  }

  const t = await getTranslations('dashboard');

  const { rows, totalCount } = await getSessionsByAgent(supabase, org.id, agent.id, {
    page: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    sortKey: 'updated_at',
    sortDirection: 'desc',
  });

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <SessionBreadcrumb slug={slug} agentName={agent.name} dashboardLabel={t('title')} />
          <h1 className="text-2xl font-bold">{t('sessionsFor', { agentName: agent.name })}</h1>
        </div>
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
