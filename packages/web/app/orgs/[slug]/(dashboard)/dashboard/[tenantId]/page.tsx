import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { ExecutionsView } from '@/app/components/dashboard/ExecutionsView';
import { Separator } from '@/components/ui/separator';
import { getExecutionsByTenant } from '@/app/lib/dashboard';
import { getOrgBySlug } from '@/app/lib/orgs';

interface TenantExecutionsPageProps {
  params: Promise<{ slug: string; tenantId: string }>;
}

const DEFAULT_PAGE_SIZE = 50;

export default async function TenantExecutionsPage({ params }: TenantExecutionsPageProps): Promise<React.JSX.Element> {
  const { slug, tenantId: rawTenantId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);
  const { result: org } = await getOrgBySlug(slug);

  if (!org) {
    redirect('/');
  }

  const t = await getTranslations('dashboard');

  const { rows, totalCount } = await getExecutionsByTenant(org.id, tenantId, {
    page: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    sortKey: 'started_at',
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
          <span className="text-foreground font-medium">{tenantId}</span>
        </nav>
      </div>

      <Separator />

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <ExecutionsView
          orgId={org.id}
          tenantId={tenantId}
          slug={slug}
          initialRows={rows}
          initialTotal={totalCount}
        />
      </div>
    </div>
  );
}
