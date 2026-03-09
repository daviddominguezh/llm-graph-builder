import { redirect } from 'next/navigation';

import { getAgentsByUser } from '@/app/lib/agents';
import { createClient } from '@/app/lib/supabase/server';

import { AgentDashboard } from './components/agents/AgentDashboard';

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { agents } = await getAgentsByUser(supabase);

  return <AgentDashboard agents={agents} userId={user.id} />;
}
