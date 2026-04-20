import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getOrgBySlug, getOrgRole } from '@/app/lib/orgs';
import { getTenantBySlug } from '@/app/lib/tenants';
import { listWhatsAppConnectionsByTenant } from '@/app/lib/whatsappTemplates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { CreateTemplateForm } from './CreateTemplateForm';

interface PageProps {
  params: Promise<{ slug: string; tenantSlug: string }>;
}

type Translator = Awaited<ReturnType<typeof getTranslations<'whatsappTemplates'>>>;

function canManage(role: string | null): boolean {
  return role === 'owner' || role === 'admin';
}

function EmptyConnections({
  orgSlug,
  tenantSlug,
  t,
}: {
  orgSlug: string;
  tenantSlug: string;
  t: Translator;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed bg-background px-4 py-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t('create.noConnections')}</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {t('create.noConnectionsDescription')}
        </p>
      </div>
      <Link href={`/orgs/${orgSlug}/tenant/${tenantSlug}`}>
        <Button variant="outline" size="sm" className="border-[0.5px] rounded-md">
          {t('create.back')}
        </Button>
      </Link>
    </div>
  );
}

function Breadcrumb({
  orgSlug,
  tenantSlug,
  tenantName,
  t,
}: {
  orgSlug: string;
  tenantSlug: string;
  tenantName: string;
  t: Translator;
}) {
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      <Link href={`/orgs/${orgSlug}/tenant/${tenantSlug}`} className="hover:text-foreground transition-colors">
        {tenantName}
      </Link>
      <span aria-hidden="true">/</span>
      <Link
        href={`/orgs/${orgSlug}/tenant/${tenantSlug}`}
        className="hover:text-foreground transition-colors"
      >
        {t('title')}
      </Link>
      <span aria-hidden="true">/</span>
      <span className="text-foreground">{t('create.pageTitle')}</span>
    </p>
  );
}

export default async function CreateTemplatePage({ params }: PageProps): Promise<React.JSX.Element> {
  const { slug, tenantSlug } = await params;
  const { result: org } = await getOrgBySlug(slug);
  if (!org) redirect('/');

  const { result: tenant } = await getTenantBySlug(org.id, tenantSlug);
  if (!tenant) redirect(`/orgs/${slug}/tenants`);

  const role = await getOrgRole(org.id);
  if (!canManage(role)) {
    redirect(`/orgs/${slug}/tenant/${tenantSlug}`);
  }

  const [{ connections }, t] = await Promise.all([
    listWhatsAppConnectionsByTenant(tenant.id),
    getTranslations('whatsappTemplates'),
  ]);

  return (
    <div className="h-[calc(100%-var(--spacing)*1.5)] overflow-y-auto p-6 border mr-1.5 rounded-xl">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <Breadcrumb orgSlug={slug} tenantSlug={tenantSlug} tenantName={tenant.name} t={t} />
        <Card className="bg-transparent ring-0 border-transparent">
          <CardHeader>
            <CardTitle>{t('create.pageTitle')}</CardTitle>
            <CardDescription>{t('create.pageSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {connections.length === 0 ? (
              <EmptyConnections orgSlug={slug} tenantSlug={tenantSlug} t={t} />
            ) : (
              <CreateTemplateForm
                tenantId={tenant.id}
                orgSlug={slug}
                tenantSlug={tenantSlug}
                connections={connections}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
