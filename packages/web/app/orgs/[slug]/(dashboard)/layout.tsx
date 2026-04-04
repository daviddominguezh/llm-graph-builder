import { AgentsSidebarProvider } from '@/app/components/agents/AgentsSidebarContext';
import { CopilotButton } from '@/app/components/copilot/CopilotButton';
import { CopilotPanel } from '@/app/components/copilot/CopilotPanel';
import { CopilotProvider } from '@/app/components/copilot/CopilotProvider';
import { EditorCacheProvider } from '@/app/components/editors/EditorCacheProvider';
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
      <CopilotProvider>
        <EditorCacheProvider>
          <div className="relative h-screen bg-sidebar pl-0 pr-1.5 py-1.5">
            <OrgSidebar org={org} />
            <main className="relative z-11 h-full bg-background ml-12.5 border border-border shadow-xs rounded-xl overflow-hidden">
              {children}
            </main>
          </div>
        </EditorCacheProvider>
        <CopilotButton />
        <CopilotPanel />
      </CopilotProvider>
    </AgentsSidebarProvider>
  );
}
