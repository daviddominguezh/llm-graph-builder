import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { AgentSummaryView } from '@/app/components/dashboard/AgentSummaryView';
import { getAgentSummary } from '@/app/lib/dashboard';
import { getOrgBySlug } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/server';

interface DashboardPageProps {
  params: Promise<{ slug: string }>;
}

const DEFAULT_PAGE_SIZE = 50;

export default async function DashboardPage({ params }: DashboardPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const supabase = await createClient();
  const { result: org } = await getOrgBySlug(supabase, slug);

  if (!org) {
    redirect('/');
  }

  const t = await getTranslations('dashboard');

  const { rows, totalCount } = await getAgentSummary(supabase, org.id, {
    page: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    sortKey: 'last_execution_at',
    sortDirection: 'desc',
  });

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <AgentSummaryView orgId={org.id} slug={slug} initialRows={rows} initialTotal={totalCount} />
      </div>
    </div>
  );
}
