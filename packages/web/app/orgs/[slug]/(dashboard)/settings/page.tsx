import { ApiKeysSection } from '@/app/components/orgs/ApiKeysSection';
import { AppearanceSection } from '@/app/components/orgs/AppearanceSection';
import { DangerZone } from '@/app/components/orgs/DangerZone';
import { EnvVariablesSection } from '@/app/components/orgs/EnvVariablesSection';
import { OrgSettingsForm } from '@/app/components/orgs/OrgSettingsForm';
import { getApiKeysByOrg } from '@/app/lib/api-keys';
import { getEnvVariablesByOrg } from '@/app/lib/org-env-variables';
import { getOrgBySlug, getOrgRole } from '@/app/lib/orgs';
import { Separator } from '@/components/ui/separator';
import { redirect } from 'next/navigation';

interface OrgSettingsPageProps {
  params: Promise<{ slug: string }>;
}

export default async function OrgSettingsPage({ params }: OrgSettingsPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: org } = await getOrgBySlug(slug);

  if (!org) {
    redirect('/');
  }

  const role = await getOrgRole(org.id);

  if (role !== 'owner') {
    redirect(`/orgs/${slug}`);
  }

  const { result: apiKeys } = await getApiKeysByOrg(org.id);
  const envVarsResult = await getEnvVariablesByOrg(org.id);
  const envVariables = envVarsResult.error === null ? envVarsResult.result : [];

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <OrgSettingsForm org={org} />
        <Separator />
        <AppearanceSection />
        <Separator />
        <ApiKeysSection orgId={org.id} initialKeys={apiKeys} />
        <Separator />
        <EnvVariablesSection orgId={org.id} initialVariables={envVariables} />
        <Separator />
        <DangerZone org={org} />
      </div>
    </div>
  );
}
