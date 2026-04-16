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
          <div className="relative flex h-screen flex-col pl-0 pr-0 pt-0 overflow-hidden bg-transparent">
            <div className="w-full flex-1 min-h-[0px] shrink-0 flex">
              <OrgSidebar org={org} />
              <MainContainer className="relative z-11 min-h-0 flex-1 shrink-0 bg-transparent pb-0 mt-1.5 pl-1.5 rounded-lg overflow-hidden">
                {children}
              </MainContainer>
            </div>
            <div className="shrink-0 flex flex-col">
              <CopilotButton />
            </div>
          </div>
        </EditorCacheProvider>
        <CopilotPanel />
      </CopilotProvider>
    </AgentsSidebarProvider>
  );
}
