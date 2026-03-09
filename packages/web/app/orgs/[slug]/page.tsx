import { redirect } from 'next/navigation';

import { getAgentsByOrg } from '@/app/lib/agents';
import { getOrgBySlug } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/server';

import { AgentDashboard } from '@/app/components/agents/AgentDashboard';
import { OrgHeader } from '@/app/components/orgs/OrgHeader';

interface OrgPageProps {
  params: Promise<{ slug: string }>;
}

export default async function OrgPage({ params }: OrgPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const supabase = await createClient();
  const { result: org } = await getOrgBySlug(supabase, slug);

  if (!org) {
    redirect('/');
  }

  const { agents } = await getAgentsByOrg(supabase, org.id);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <OrgHeader org={org} />
      <AgentDashboard agents={agents} orgId={org.id} />
    </div>
  );
}
