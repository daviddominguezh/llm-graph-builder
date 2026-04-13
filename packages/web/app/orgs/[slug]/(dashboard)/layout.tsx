import { AgentsSidebarProvider } from '@/app/components/agents/AgentsSidebarContext';
import { CopilotButton } from '@/app/components/copilot/CopilotButton';
import { CopilotPanel } from '@/app/components/copilot/CopilotPanel';
import { CopilotProvider } from '@/app/components/copilot/CopilotProvider';
import { EditorCacheProvider, MainContainer } from '@/app/components/editors/EditorCacheProvider';
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
          <div className="relative flex h-screen flex-col bg-sidebar pl-0 pr-1.5 pt-1.5 overflow-hidden">
            <OrgSidebar org={org} />
            <MainContainer className="relative z-11 min-h-0 flex-1 bg-transparent ml-12.5 border border-border shadow-xs rounded-xl overflow-hidden">
              {children}
            </MainContainer>
            <CopilotButton />
          </div>
        </EditorCacheProvider>
        <CopilotPanel />
      </CopilotProvider>
    </AgentsSidebarProvider>
  );
}
