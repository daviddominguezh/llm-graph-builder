import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { TenantSummaryView } from '@/app/components/dashboard/TenantSummaryView';
import { Separator } from '@/components/ui/separator';
import { getDashboardTimeSeries, getTenantSummary } from '@/app/lib/dashboard';
import { getOrgBySlug } from '@/app/lib/orgs';

interface DashboardPageProps {
  params: Promise<{ slug: string }>;
}

const DEFAULT_PAGE_SIZE = 50;

export default async function DashboardPage({ params }: DashboardPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: org } = await getOrgBySlug(slug);

  if (!org) {
    redirect('/');
  }

  const t = await getTranslations('dashboard');

  const [{ rows, totalCount }, { rows: timeSeriesRows }] = await Promise.all([
    getTenantSummary(org.id, {
      page: 0,
      pageSize: DEFAULT_PAGE_SIZE,
      sortKey: 'last_execution_at',
      sortDirection: 'desc',
    }),
    getDashboardTimeSeries(org.id),
  ]);

  return (
    <div className="flex h-full flex-col bg-background border border mr-1.5 rounded-lg overflow-hidden">
      <div className="px-4 py-3 shrink-0 bg-background">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <span className="text-foreground font-medium text-xs">{t('title')}</span>
        </nav>
      </div>

      <Separator />

      <div className="flex-1 overflow-hidden px-4 py-3">
        <TenantSummaryView
          orgId={org.id}
          slug={slug}
          initialRows={rows}
          initialTotal={totalCount}
          initialTimeSeries={timeSeriesRows}
        />
      </div>
    </div>
  );
}
