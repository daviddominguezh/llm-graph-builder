import { TenantsSection } from '@/app/components/orgs/tenants/TenantsSection';
import { getOrgBySlug } from '@/app/lib/orgs';
import { getTenantsByOrg } from '@/app/lib/tenants';
import { redirect } from 'next/navigation';

interface TenantsPageProps {
  params: Promise<{ slug: string }>;
}

export default async function TenantsPage({ params }: TenantsPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: org } = await getOrgBySlug(slug);

  if (!org) {
    redirect('/');
  }

  const { result: tenants } = await getTenantsByOrg(org.id);

  return (
    <div className="h-[calc(100%-var(--spacing)*2.5)] overflow-y-auto p-6 border mr-2.5 rounded-xl bg-background">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <TenantsSection orgId={org.id} orgSlug={slug} initialTenants={tenants} />
      </div>
    </div>
  );
}
