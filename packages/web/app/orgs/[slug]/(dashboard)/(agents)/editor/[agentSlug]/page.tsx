import { getAgentBySlug } from '@/app/lib/agents';
import { getApiKeysByOrg } from '@/app/lib/apiKeys';
import { getOrgBySlug } from '@/app/lib/orgs';
import { getTenantsByOrg } from '@/app/lib/tenants';
import { redirect } from 'next/navigation';

import { EditorTabs } from './EditorTabs';

interface EditorPageProps {
  params: Promise<{ slug: string; agentSlug: string }>;
}

export default async function EditorPage({ params }: EditorPageProps): Promise<React.JSX.Element> {
  const { slug, agentSlug } = await params;
  console.log('[EditorPage] start', { slug, agentSlug });

  const [{ result: org }, agentResult] = await Promise.all([getOrgBySlug(slug), getAgentBySlug(agentSlug)]);
  const { agent } = agentResult;
  console.log(
    '[EditorPage] fetched',
    JSON.stringify(
      {
        slug,
        agentSlug,
        orgId: org?.id ?? null,
        agentExists: agent !== null,
        agentOrgId: agent?.org_id ?? null,
        agentResultError: agentResult.error,
      },
      null,
      2
    )
  );
  if (!org) {
    console.log('[EditorPage] redirect → / (no org)');
    redirect('/');
  }
  if (!agent || agent.org_id !== org.id) {
    console.log('[EditorPage] redirect → /orgs/' + slug, {
      reason: !agent ? 'agent is null' : 'org mismatch',
      agentOrgId: agent?.org_id ?? null,
      orgId: org.id,
    });
    redirect(`/orgs/${slug}`);
  }

  const [apiKeysResult, tenantsResult] = await Promise.all([
    getApiKeysByOrg(org.id),
    getTenantsByOrg(org.id),
  ]);
  const { result: orgApiKeys, error: apiKeyError } = apiKeysResult;
  const { result: tenantRows, error: tenantsError } = tenantsResult;
  if (apiKeyError !== null) console.error('[EditorPage] failed to load API keys:', apiKeyError);
  if (tenantsError !== null) console.error('[EditorPage] failed to load tenants:', tenantsError);
  const tenants = [...tenantRows]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(({ id, slug: tenantSlug, name }) => ({ id, slug: tenantSlug, name }));

  return (
    <EditorTabs
      agentSlug={agent.slug}
      tenants={tenants}
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
      agentDescription={agent.description}
      agentCategory={agent.category}
      agentIsPublic={agent.is_public}
      agentAppType={agent.app_type}
      agentSelectedTools={agent.selected_tools}
      agentUpdatedAt={agent.updated_at}
    />
  );
}
