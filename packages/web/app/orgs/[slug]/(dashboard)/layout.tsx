import { redirect } from 'next/navigation';

import { OrgSidebar } from '@/app/components/orgs/OrgSidebar';
import { getOrgBySlug } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/server';

interface OrgLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function OrgLayout({ children, params }: OrgLayoutProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const supabase = await createClient();
  const { result: org } = await getOrgBySlug(supabase, slug);

  if (!org) {
    redirect('/');
  }

  return (
    <div className="relative h-screen">
      <OrgSidebar org={org} />
      <main className="h-full pl-16">{children}</main>
    </div>
  );
}
