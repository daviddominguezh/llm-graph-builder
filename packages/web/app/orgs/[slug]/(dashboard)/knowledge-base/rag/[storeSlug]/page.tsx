import { getOrgBySlug } from '@/app/lib/orgs';
import { getRagStoresByOrg } from '@/app/lib/ragStores';
import { getTenantsByOrg } from '@/app/lib/tenants';
import { notFound, redirect } from 'next/navigation';

import { RagStorePageClient } from './RagStorePageClient';

interface RagStorePageProps {
  params: Promise<{ slug: string; storeSlug: string }>;
}

export default async function RagStorePage({ params }: RagStorePageProps): Promise<React.JSX.Element> {
  const { slug, storeSlug } = await params;
  const { result: org } = await getOrgBySlug(slug);
  if (!org) redirect('/');

  const [{ result: stores }, { result: tenants }] = await Promise.all([
    getRagStoresByOrg(org.id),
    getTenantsByOrg(org.id),
  ]);
  const store = stores.find((s) => s.slug === storeSlug);
  if (store === undefined) notFound();

  return <RagStorePageClient orgSlug={slug} store={store} tenants={tenants} />;
}
