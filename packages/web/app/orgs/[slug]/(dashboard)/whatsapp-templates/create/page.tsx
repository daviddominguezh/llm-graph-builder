import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getOrgBySlug, getOrgRole } from '@/app/lib/orgs';
import { listWhatsAppConnectionsByOrg } from '@/app/lib/whatsappTemplates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { CreateTemplateForm } from './CreateTemplateForm';

interface PageProps {
  params: Promise<{ slug: string }>;
}

type Translator = Awaited<ReturnType<typeof getTranslations<'whatsappTemplates'>>>;

function canManage(role: string | null): boolean {
  return role === 'owner' || role === 'admin';
}

function EmptyConnections({ slug, t }: { slug: string; t: Translator }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed bg-background px-4 py-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t('create.noConnections')}</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {t('create.noConnectionsDescription')}
        </p>
      </div>
      <Link href={`/orgs/${slug}/whatsapp-templates`}>
        <Button variant="outline" size="sm" className="border-[0.5px] rounded-md">
          {t('create.back')}
        </Button>
      </Link>
    </div>
  );
}

function HeaderTitleBlock({ slug, t }: { slug: string; t: Translator }) {
  return (
    <div className="flex items-start gap-2">
      <Link href={`/orgs/${slug}/whatsapp-templates`} className="-ml-1 mt-0.5 shrink-0">
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:bg-muted">
          <ArrowLeft className="size-3.5" />
        </Button>
      </Link>
      <div className="space-y-0.5">
        <CardTitle>{t('create.pageTitle')}</CardTitle>
        <CardDescription>{t('create.pageSubtitle')}</CardDescription>
      </div>
    </div>
  );
}

export default async function CreateTemplatePage({ params }: PageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: org } = await getOrgBySlug(slug);
  if (!org) redirect('/');

  const role = await getOrgRole(org.id);
  if (!canManage(role)) {
    redirect(`/orgs/${slug}/whatsapp-templates`);
  }

  const [{ connections }, t] = await Promise.all([
    listWhatsAppConnectionsByOrg(org.id),
    getTranslations('whatsappTemplates'),
  ]);

  return (
    <div className="h-[calc(100%-var(--spacing)*1.5)] overflow-y-auto p-6 border mr-1.5 rounded-xl">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <Card className="bg-transparent ring-0 border-transparent">
          <CardHeader>
            <HeaderTitleBlock slug={slug} t={t} />
          </CardHeader>
          <CardContent>
            {connections.length === 0 ? (
              <EmptyConnections slug={slug} t={t} />
            ) : (
              <CreateTemplateForm orgId={org.id} slug={slug} connections={connections} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
