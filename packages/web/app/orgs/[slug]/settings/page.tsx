import { ApiKeysSection } from '@/app/components/orgs/ApiKeysSection';
import { DangerZone } from '@/app/components/orgs/DangerZone';
import { OrgSettingsForm } from '@/app/components/orgs/OrgSettingsForm';
import { getApiKeysByOrg } from '@/app/lib/api-keys';
import { getOrgBySlug } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

import { OrgSettingsHeader } from './OrgSettingsHeader';

interface OrgSettingsPageProps {
  params: Promise<{ slug: string }>;
}

interface MemberRole {
  role: string;
}

function isMemberRole(value: unknown): value is MemberRole {
  return typeof value === 'object' && value !== null && 'role' in value;
}

async function verifyOwnership(supabase: SupabaseClient, orgId: string): Promise<boolean> {
  const { data } = await supabase.from('org_members').select('role').eq('org_id', orgId).single();

  if (!isMemberRole(data)) return false;
  return data.role === 'owner';
}

export default async function OrgSettingsPage({ params }: OrgSettingsPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const supabase = await createClient();
  const { result: org } = await getOrgBySlug(supabase, slug);

  if (!org) {
    redirect('/');
  }

  const isOwner = await verifyOwnership(supabase, org.id);

  if (!isOwner) {
    redirect(`/orgs/${slug}`);
  }

  const { result: apiKeys } = await getApiKeysByOrg(supabase, org.id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <OrgSettingsHeader slug={slug} />
      <OrgSettingsForm org={org} />
      <ApiKeysSection orgId={org.id} initialKeys={apiKeys} />
      <DangerZone org={org} />
    </div>
  );
}
