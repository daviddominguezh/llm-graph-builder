import { getGoogleCalendarConnectionStatus } from '@/app/actions/googleOauth';
import { ApiKeysSection } from '@/app/components/orgs/ApiKeysSection';
import { DangerZone } from '@/app/components/orgs/DangerZone';
import { EnvVariablesSection } from '@/app/components/orgs/EnvVariablesSection';
import { GoogleCalendarSection } from '@/app/components/orgs/GoogleCalendarSection';
import { OrgSettingsForm } from '@/app/components/orgs/OrgSettingsForm';
import { Scrollable } from '@/app/components/Scrollable';
import { getOrgSettingsBundle } from '@/app/lib/orgs';
import { Separator } from '@/components/ui/separator';
import { redirect } from 'next/navigation';

interface OrgSettingsPageProps {
  params: Promise<{ slug: string }>;
}

export default async function OrgSettingsPage({ params }: OrgSettingsPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: bundle } = await getOrgSettingsBundle(slug);

  if (bundle === null) {
    redirect('/');
  }
  if (bundle.role !== 'owner') {
    redirect(`/orgs/${slug}`);
  }

  const { org, apiKeys, envVariables } = bundle;
  const googleCalendarStatus = await getGoogleCalendarConnectionStatus(org.id);

  return (
    <Scrollable className="h-[calc(100%-var(--spacing)*2.5)] p-6 border rounded-xl mr-2.5 bg-background">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <OrgSettingsForm org={org} />
        <Separator />
        <ApiKeysSection orgId={org.id} initialKeys={apiKeys} />
        <Separator />
        <EnvVariablesSection orgId={org.id} initialVariables={envVariables} />
        <Separator />
        <GoogleCalendarSection orgId={org.id} initialStatus={googleCalendarStatus} />
        <Separator />
        <DangerZone org={org} />
      </div>
    </Scrollable>
  );
}
