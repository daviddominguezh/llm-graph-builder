import { redirect } from 'next/navigation';

import { getAgentBySlug } from '@/app/lib/agents';
import { createClient } from '@/app/lib/supabase/server';

import { EditorClient } from './EditorClient';

interface EditorPageProps {
  params: Promise<{ slug: string }>;
}

export default async function EditorPage({ params }: EditorPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const supabase = await createClient();
  const { agent } = await getAgentBySlug(supabase, slug);

  if (!agent) {
    redirect('/');
  }

  return (
    <EditorClient
      agentId={agent.id}
      agentName={agent.name}
      initialGraphData={agent.graph_data_staging}
      initialProductionData={agent.graph_data_production}
      initialVersion={agent.version}
    />
  );
}
