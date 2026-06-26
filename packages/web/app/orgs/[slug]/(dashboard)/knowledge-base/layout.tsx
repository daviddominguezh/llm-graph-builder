import { getKvStoresByOrg } from '@/app/lib/kvStores';
import { getOrgBySlug } from '@/app/lib/orgs';
import { getRagStoresByOrg } from '@/app/lib/ragStores';
import { redirect } from 'next/navigation';

import { StoresSidebar } from './StoresSidebar';

interface KnowledgeBaseLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function KnowledgeBaseLayout({
  children,
  params,
}: KnowledgeBaseLayoutProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: org } = await getOrgBySlug(slug);
  if (!org) {
    redirect('/');
  }

  const [{ result: ragStores }, { result: kvStores }] = await Promise.all([
    getRagStoresByOrg(org.id),
    getKvStoresByOrg(org.id),
  ]);

  return (
    <div className="relative flex h-[calc(100%-var(--spacing)*2.5)] overflow-hidden border mr-2.5 rounded-xl bg-background">
      <StoresSidebar
        orgId={org.id}
        orgSlug={slug}
        initialRagStores={ragStores}
        initialKvStores={kvStores}
      />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
