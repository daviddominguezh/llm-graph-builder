import { MessageSquareDashed, Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getOrgBySlug, getOrgRole } from '@/app/lib/orgs';
import type { WhatsAppTemplate } from '@/app/lib/whatsappTemplates';
import { listTemplatesByOrg } from '@/app/lib/whatsappTemplates';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { DeleteTemplateButton } from './delete-template-button';
import { StatusBadge } from './status-badge';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';

function canManageTemplates(role: string | null): boolean {
  return role === 'owner' || role === 'admin';
}

type Translator = Awaited<ReturnType<typeof getTranslations<'whatsappTemplates'>>>;

function TemplatesEmptyState({ t }: { t: Translator }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed bg-background px-4 py-8 text-center">
      <MessageSquareDashed className="size-6 text-muted-foreground/50" />
      <p className="text-sm font-medium">{t('empty')}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{t('emptyDescription')}</p>
    </div>
  );
}

function TemplateMeta({ template, t }: { template: WhatsAppTemplate; t: Translator }) {
  const parts = [
    t(`categories.${template.category}`),
    template.variables.length === 1
      ? `1 ${t('table.variables').toLowerCase()}`
      : `${String(template.variables.length)} ${t('table.variables').toLowerCase()}`,
  ];
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span>{parts[0]}</span>
      <span className="text-muted-foreground/40">·</span>
      <span>{parts[1]}</span>
      {template.meta_template_id !== null ? (
        <>
          <span className="text-muted-foreground/40">·</span>
          <code className="font-mono truncate max-w-[180px]">{template.meta_template_id}</code>
        </>
      ) : null}
    </div>
  );
}

function TemplateRow({
  template,
  orgId,
  slug,
  canManage,
  t,
}: {
  template: WhatsAppTemplate;
  orgId: string;
  slug: string;
  canManage: boolean;
  t: Translator;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-transparent bg-card px-3 py-2 dark:bg-input/30">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{template.name}</span>
          <StatusBadge status={template.status} />
        </div>
        <p className="truncate text-xs text-muted-foreground/80">{template.body}</p>
        <TemplateMeta template={template} t={t} />
      </div>
      {canManage ? (
        <DeleteTemplateButton
          orgId={orgId}
          slug={slug}
          templateId={template.id}
          templateName={template.name}
        />
      ) : null}
    </div>
  );
}

function TemplatesList({
  templates,
  orgId,
  slug,
  canManage,
  t,
}: {
  templates: WhatsAppTemplate[];
  orgId: string;
  slug: string;
  canManage: boolean;
  t: Translator;
}) {
  if (templates.length === 0) return <TemplatesEmptyState t={t} />;

  return (
    <div className="flex flex-col gap-1.5">
      {templates.map((template) => (
        <TemplateRow
          key={template.id}
          template={template}
          orgId={orgId}
          slug={slug}
          canManage={canManage}
          t={t}
        />
      ))}
    </div>
  );
}

function CreateTemplateAction({ slug, t }: { slug: string; t: Translator }) {
  return (
    <Link href={`/orgs/${slug}/whatsapp-templates/create`}>
      <Button variant="outline" size="sm" className="border-[0.5px] rounded-md">
        <Plus className="size-3.5" />
        {t('createButton')}
      </Button>
    </Link>
  );
}

export default async function WhatsAppTemplatesPage({ params }: PageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: org } = await getOrgBySlug(slug);
  if (!org) redirect('/');

  const [role, { templates }, t] = await Promise.all([
    getOrgRole(org.id),
    listTemplatesByOrg(org.id),
    getTranslations('whatsappTemplates'),
  ]);

  const canManage = canManageTemplates(role);

  return (
    <div className="h-[calc(100%-var(--spacing)*1.5)] overflow-y-auto p-6 border mr-1.5 rounded-xl">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Card className="bg-transparent ring-0 border-transparent">
          <CardHeader>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('subtitle')}</CardDescription>
            {canManage ? (
              <CardAction>
                <CreateTemplateAction slug={slug} t={t} />
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            <TemplatesList
              templates={templates}
              orgId={org.id}
              slug={slug}
              canManage={canManage}
              t={t}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
