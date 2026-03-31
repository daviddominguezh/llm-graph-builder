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
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <TenantsSection orgId={org.id} initialTenants={tenants} />
      </div>
    </div>
  );
}
