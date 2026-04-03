import { getOrgBySlug } from '@/app/lib/orgs';
import { getTenantsByOrg } from '@/app/lib/tenants';
import { redirect } from 'next/navigation';

import { ChatsClient } from './ChatsClient';

interface ChatsPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ChatsPage({ params }: ChatsPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: org } = await getOrgBySlug(slug);

  if (!org) {
    redirect('/');
  }

  const { result: tenants } = await getTenantsByOrg(org.id);
  const defaultTenantId = tenants[0]?.id ?? '';

  return <ChatsClient tenants={tenants} defaultTenantId={defaultTenantId} />;
}
