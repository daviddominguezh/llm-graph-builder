import { ExecutionKeysSection } from '@/app/components/orgs/execution-keys/ExecutionKeysSection';
import { getAgentsByOrg } from '@/app/lib/agents';
import type { ExecutionKeyWithAgents } from '@/app/lib/executionKeys';
import { getAgentsForKey, getExecutionKeysByOrg } from '@/app/lib/executionKeysQueries';
import { getOrgBySlug } from '@/app/lib/orgs';
import { redirect } from 'next/navigation';

interface ApiKeysPageProps {
  params: Promise<{ slug: string }>;
}

async function fetchKeysWithAgents(orgId: string): Promise<ExecutionKeyWithAgents[]> {
  const { result: keys } = await getExecutionKeysByOrg(orgId);

  const results = await Promise.all(
    keys.map(async (key) => {
      const { result: agents } = await getAgentsForKey(key.id);
      return { ...key, agents };
    })
  );

  return results;
}

export default async function ApiKeysPage({ params }: ApiKeysPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: org } = await getOrgBySlug(slug);

  if (!org) {
    redirect('/');
  }

  const [keysWithAgents, { agents: allAgents }] = await Promise.all([
    fetchKeysWithAgents(org.id),
    getAgentsByOrg(org.id),
  ]);

  const publishedAgents = allAgents.filter((a) => a.published_at !== null);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <ExecutionKeysSection orgId={org.id} initialKeys={keysWithAgents} agents={publishedAgents} />
      </div>
    </div>
  );
}
