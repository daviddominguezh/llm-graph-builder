import { ExecutionsView } from '@/app/components/dashboard/ExecutionsView';
import { getTenantExecutionsBundle } from '@/app/lib/dashboard';
import { getOrgBySlug } from '@/app/lib/orgs';
import { Separator } from '@/components/ui/separator';
import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

interface TenantExecutionsPageProps {
  params: Promise<{ slug: string; tenantId: string }>;
}

const DEFAULT_PAGE_SIZE = 50;

export default async function TenantExecutionsPage({
  params,
}: TenantExecutionsPageProps): Promise<React.JSX.Element> {
  const { slug, tenantId: rawTenantSlug } = await params;
  const tenantSlug = decodeURIComponent(rawTenantSlug);

  const { result: org } = await getOrgBySlug(slug);
  if (!org) redirect('/');

  const [{ result: bundle }, t] = await Promise.all([
    getTenantExecutionsBundle(org.id, tenantSlug, {
      page: 0,
      pageSize: DEFAULT_PAGE_SIZE,
      sortKey: 'started_at',
      sortDirection: 'desc',
    }),
    getTranslations('dashboard'),
  ]);
  if (!bundle) redirect(`/orgs/${slug}/dashboard`);

  const { tenant, executions } = bundle;
  const tenantId = tenant.tenant_id;

  return (
    <div className="flex h-[calc(100%-var(--spacing)*2.5)] flex-col bg-background overflow-hidden border border mr-2.5 rounded-xl">
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
          initialRows={executions.rows}
          initialTotal={executions.totalCount}
        />
      </div>
    </div>
  );
}
