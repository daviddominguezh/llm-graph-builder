import { getOrgBySlug } from '@/app/lib/orgs';
import { getTenantsByOrg } from '@/app/lib/tenants';
import { redirect } from 'next/navigation';

import { CalendarClient } from './CalendarClient';

interface CalendarPageProps {
  params: Promise<{ slug: string }>;
}

export default async function CalendarPage({ params }: CalendarPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: org } = await getOrgBySlug(slug);

  if (!org) {
    redirect('/');
  }

  const { result: tenants } = await getTenantsByOrg(org.id);
  const defaultTenantId = tenants[0]?.id ?? '';

  return <CalendarClient tenants={tenants} defaultTenantId={defaultTenantId} />;
}
