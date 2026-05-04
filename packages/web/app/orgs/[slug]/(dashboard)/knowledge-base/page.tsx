import { getOrgBySlug } from '@/app/lib/orgs';
import { getTenantsByOrg } from '@/app/lib/tenants';
import { redirect } from 'next/navigation';

import { KnowledgeBaseClient } from './KnowledgeBaseClient';

interface KnowledgeBasePageProps {
  params: Promise<{ slug: string }>;
}

export default async function KnowledgeBasePage({
  params,
}: KnowledgeBasePageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: org } = await getOrgBySlug(slug);

  if (!org) {
    redirect('/');
  }

  const { result: tenants } = await getTenantsByOrg(org.id);
  const defaultTenantId = tenants[0]?.id ?? '';

  return (
    <KnowledgeBaseClient
      tenants={tenants}
      defaultTenantId={defaultTenantId}
      orgSlug={slug}
    />
  );
}
