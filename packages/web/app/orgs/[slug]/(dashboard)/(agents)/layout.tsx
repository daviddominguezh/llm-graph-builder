import { redirect } from 'next/navigation';

import { AgentsSidebar } from '@/app/components/agents/AgentsSidebar';
import { getCachedAgentsByOrg } from '@/app/lib/agents';
import { getOrgBySlug } from '@/app/lib/orgs';

interface AgentsLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function AgentsLayout({ children, params }: AgentsLayoutProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: org } = await getOrgBySlug(slug);

  if (!org) {
    redirect('/');
  }

  const { agents } = await getCachedAgentsByOrg(org.id);

  return (
    <div className="flex h-[calc(100%-var(--spacing)*2.5)] p-0 bg-transparent rounded-xl mr-2.5 overflow-hidden pt-[1px]">
      <AgentsSidebar agents={agents} orgId={org.id} orgSlug={org.slug} />
      <div className="flex-1 overflow-hidden bg-transparent bg-blue-500">{children}</div>
    </div>
  );
}
