import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { ExecutionsView } from '@/app/components/dashboard/ExecutionsView';
import { Separator } from '@/components/ui/separator';
import { getExecutionsByTenant, getTenantSummary } from '@/app/lib/dashboard';
import { getOrgBySlug } from '@/app/lib/orgs';

interface TenantExecutionsPageProps {
  params: Promise<{ slug: string; tenantId: string }>;
}

const DEFAULT_PAGE_SIZE = 50;

async function resolveTenant(orgId: string, tenantSlug: string) {
  const { rows } = await getTenantSummary(orgId, {
    page: 0,
    pageSize: 1,
    filters: { tenant_name: tenantSlug },
  });
  return rows[0] ?? null;
}

export default async function TenantExecutionsPage({ params }: TenantExecutionsPageProps): Promise<React.JSX.Element> {
  const { slug, tenantId: rawTenantSlug } = await params;
  const tenantSlug = decodeURIComponent(rawTenantSlug);
  const { result: org } = await getOrgBySlug(slug);

  if (!org) redirect('/');

  const tenant = await resolveTenant(org.id, tenantSlug);
  if (!tenant) redirect(`/orgs/${slug}/dashboard`);

  const t = await getTranslations('dashboard');
  const tenantId = tenant.tenant_id;

  const { rows, totalCount } = await getExecutionsByTenant(org.id, tenantId, {
    page: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    sortKey: 'started_at',
    sortDirection: 'desc',
  });

  return (
    <div className="flex h-[calc(100%-var(--spacing)*1.5)] flex-col bg-background overflow-hidden border border mr-1.5 rounded-xl">
      <div className="px-4 py-3 shrink-0 bg-background">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link href={`/orgs/${slug}/dashboard`} className="hover:text-foreground text-xs font-medium">
            {t('title')}
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-foreground text-xs font-medium">{tenant.tenant_name}</span>
        </nav>
      </div>

      <Separator />

      <div className="flex-1 overflow-hidden px-4 py-3">
        <ExecutionsView
          orgId={org.id}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          slug={slug}
          initialRows={rows}
          initialTotal={totalCount}
        />
      </div>
    </div>
  );
}
