import { ArrowLeft, MessageSquareDashed } from 'lucide-react';
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
    <div className="rounded-md border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
      <p className="mb-2 font-medium text-foreground">{t('create.noConnections')}</p>
      <p>{t('create.noConnectionsDescription')}</p>
      <div className="mt-3">
        <Link href={`/orgs/${slug}/whatsapp-templates`}>
          <Button variant="outline" className="border-border" size="sm">
            {t('create.back')}
          </Button>
        </Link>
      </div>
    </div>
  );
}

function PageHeader({ slug, t }: { slug: string; t: Translator }) {
  return (
    <div className="flex items-center gap-4">
      <Link href={`/orgs/${slug}/whatsapp-templates`}>
        <Button variant="ghost" size="icon" className="text-foreground/70 hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </Button>
      </Link>
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t('create.pageTitle')}</h1>
        <p className="text-muted-foreground mt-1">{t('create.pageSubtitle')}</p>
      </div>
    </div>
  );
}

function FormCardHeader({ t }: { t: Translator }) {
  return (
    <CardHeader>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
          <MessageSquareDashed className="w-5 h-5 text-foreground" />
        </div>
        <div>
          <CardTitle className="text-foreground">{t('create.cardTitle')}</CardTitle>
          <CardDescription>{t('create.cardSubtitle')}</CardDescription>
        </div>
      </div>
    </CardHeader>
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
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader slug={slug} t={t} />

        {connections.length === 0 ? (
          <EmptyConnections slug={slug} t={t} />
        ) : (
          <Card className="border-border shadow-lg">
            <FormCardHeader t={t} />
            <CardContent>
              <CreateTemplateForm orgId={org.id} slug={slug} connections={connections} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
