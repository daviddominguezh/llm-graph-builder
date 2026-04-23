import { getOrgBySlug } from '@/app/lib/orgs';
import { getTenantPageBundle } from '@/app/lib/tenants';
import { Separator } from '@/components/ui/separator';
import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { TenantSettingsForm } from './TenantSettingsForm';
import { WebChannelSection } from './WebChannelSection';
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

  const [{ result: bundle }, t] = await Promise.all([
    getTenantPageBundle(org.id, tenantSlug),
    getTranslations('tenants'),
  ]);
  if (!bundle) redirect(`/orgs/${slug}/tenants`);

  const { tenant, role, templates, connections } = bundle;
  const canManage = canManageTemplates(role);

  return (
    <div className="flex h-[calc(100%-var(--spacing)*2)] flex-col overflow-hidden border mr-2 rounded-xl bg-background">
      <div className="px-6 py-3 shrink-0 bg-background">
        <nav className="mx-auto flex w-full max-w-2xl items-center gap-1 pl-4 text-sm text-muted-foreground">
          <Link href={`/orgs/${slug}/tenants`} className="hover:text-foreground text-xs font-medium">
            {t('title')}
          </Link>
          <ChevronRight aria-hidden="true" className="size-3" />
          <span className="text-foreground text-xs font-medium">{tenant.name}</span>
        </nav>
      </div>

      <Separator />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <TenantSettingsForm tenant={tenant} orgSlug={slug} />
          <Separator />
          <WhatsAppTemplatesSection
            tenantId={tenant.id}
            orgSlug={slug}
            tenantSlug={tenantSlug}
            templates={templates}
            connections={connections}
            canManage={canManage}
          />
          <Separator />
          <WebChannelSection tenant={tenant} />
        </div>
      </div>
    </div>
  );
}
