import { AgentsSidebarProvider } from '@/app/components/agents/AgentsSidebarContext';
import { OrgSidebar } from '@/app/components/orgs/OrgSidebar';
import { getOrgBySlug } from '@/app/lib/orgs';
import { redirect } from 'next/navigation';

interface OrgLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function OrgLayout({ children, params }: OrgLayoutProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: org } = await getOrgBySlug(slug);

  if (!org) {
    redirect('/');
  }

  return (
    <AgentsSidebarProvider>
      <div className="relative h-screen bg-sidebar">
        <OrgSidebar org={org} />
        <main className="relative z-11 h-full bg-background ml-12.5 border rounded-xl shadow-sm overflow-hidden">
          {children}
        </main>
      </div>
    </AgentsSidebarProvider>
  );
}
