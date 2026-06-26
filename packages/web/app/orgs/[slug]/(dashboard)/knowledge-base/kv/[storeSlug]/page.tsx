import { getKvStoresByOrg } from '@/app/lib/kvStores';
import { getOrgBySlug } from '@/app/lib/orgs';
import { getTenantsByOrg } from '@/app/lib/tenants';
import { notFound, redirect } from 'next/navigation';

import { KvStorePageClient } from './KvStorePageClient';

interface KvStorePageProps {
  params: Promise<{ slug: string; storeSlug: string }>;
}

export default async function KvStorePage({ params }: KvStorePageProps): Promise<React.JSX.Element> {
  const { slug: orgSlug, storeSlug } = await params;
  const { result: org } = await getOrgBySlug(orgSlug);
  if (!org) redirect('/');

  const [{ result: stores }, { result: tenants }] = await Promise.all([
    getKvStoresByOrg(org.id),
    getTenantsByOrg(org.id),
  ]);
  const store = stores.find((s) => s.slug === storeSlug);
  if (store === undefined) notFound();

  return <KvStorePageClient store={store} tenants={tenants} />;
}
