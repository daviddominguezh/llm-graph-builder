import { redirect } from 'next/navigation';

import { getAgentBySlug } from '@/app/lib/agents';
import { getApiKeysByOrg } from '@/app/lib/api-keys';
import { getOrgBySlug } from '@/app/lib/orgs';

import { EditorClient } from './EditorClient';

interface EditorPageProps {
  params: Promise<{ slug: string; agentSlug: string }>;
}

export default async function EditorPage({ params }: EditorPageProps): Promise<React.JSX.Element> {
  const { slug, agentSlug } = await params;

  const { result: org } = await getOrgBySlug(slug);
  if (!org) redirect('/');

  const { agent } = await getAgentBySlug(agentSlug);
  if (!agent || agent.org_id !== org.id) redirect(`/orgs/${slug}`);

  const { result: orgApiKeys, error: apiKeyError } = await getApiKeysByOrg(org.id);
  if (apiKeyError !== null) {
    console.error('[EditorPage] failed to load API keys:', apiKeyError);
  }

  return (
    <EditorClient
      agentId={agent.id}
      agentName={agent.name}
      orgSlug={org.slug}
      orgId={org.id}
      orgName={org.name}
      orgAvatarUrl={org.avatar_url}
      initialVersion={agent.current_version}
      orgApiKeys={orgApiKeys}
      stagingApiKeyId={agent.staging_api_key_id}
      productionApiKeyId={agent.production_api_key_id}
    />
  );
}
