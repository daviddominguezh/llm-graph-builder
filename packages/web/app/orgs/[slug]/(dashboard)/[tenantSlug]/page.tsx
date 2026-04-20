import { redirect } from 'next/navigation';

import { getOrgBySlug, getOrgRole } from '@/app/lib/orgs';
import { getTenantBySlug } from '@/app/lib/tenants';
import { listTemplatesByTenant } from '@/app/lib/whatsappTemplates';
import { Separator } from '@/components/ui/separator';

import { TenantSettingsForm } from './TenantSettingsForm';
import { WhatsAppTemplatesSection } from './whatsapp-templates/WhatsAppTemplatesSection';

interface PageProps {
  params: Promise<{ slug: string; tenantSlug: string }>;
}

export const dynamic = 'force-dynamic';

function canManageTemplates(role: string | null): boolean {
  return role === 'owner' || role === 'admin';
}

export default async function TenantPage({ params }: PageProps): Promise<React.JSX.Element> {
  const { slug, tenantSlug } = await params;
  const { result: org } = await getOrgBySlug(slug);
  if (!org) redirect('/');

  const { result: tenant } = await getTenantBySlug(org.id, tenantSlug);
  if (!tenant) redirect(`/orgs/${slug}/tenants`);

  const [role, { templates }] = await Promise.all([
    getOrgRole(org.id),
    listTemplatesByTenant(tenant.id),
  ]);

  const canManage = canManageTemplates(role);

  return (
    <div className="h-[calc(100%-var(--spacing)*1.5)] overflow-y-auto p-6 border rounded-xl mr-1.5 overflow-hidden">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <TenantSettingsForm tenant={tenant} orgSlug={slug} />
        <Separator />
        <WhatsAppTemplatesSection
          tenantId={tenant.id}
          orgSlug={slug}
          tenantSlug={tenantSlug}
          templates={templates}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
