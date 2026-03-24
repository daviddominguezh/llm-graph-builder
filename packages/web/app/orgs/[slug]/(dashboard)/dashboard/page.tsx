import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { AgentSummaryView } from '@/app/components/dashboard/AgentSummaryView';
import { Separator } from '@/components/ui/separator';
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
    <div className="flex h-full flex-col bg-muted">
      <div className="px-6 py-4 shrink-0 bg-muted">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <span className="text-foreground font-medium">{t('title')}</span>
        </nav>
      </div>

      <Separator />

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <AgentSummaryView orgId={org.id} slug={slug} initialRows={rows} initialTotal={totalCount} />
      </div>
    </div>
  );
}
