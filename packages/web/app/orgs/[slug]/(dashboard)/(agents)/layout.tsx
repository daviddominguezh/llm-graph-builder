import { redirect } from 'next/navigation';

import { AgentsSidebar } from '@/app/components/agents/AgentsSidebar';
import { getAgentsByOrg } from '@/app/lib/agents';
import { getOrgBySlug } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/server';

interface AgentsLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function AgentsLayout({ children, params }: AgentsLayoutProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const supabase = await createClient();
  const { result: org } = await getOrgBySlug(supabase, slug);

  if (!org) {
    redirect('/');
  }

  const { agents } = await getAgentsByOrg(supabase, org.id);

  return (
    <div className="flex h-full p-1">
      <AgentsSidebar agents={agents} orgId={org.id} orgSlug={org.slug} />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
