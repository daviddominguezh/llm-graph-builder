import { MessageSquareDashed, Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getOrgBySlug, getOrgRole } from '@/app/lib/orgs';
import type { WhatsAppTemplate } from '@/app/lib/whatsappTemplates';
import { listTemplatesByOrg } from '@/app/lib/whatsappTemplates';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
    <div className="text-center py-12 text-muted-foreground">
      <MessageSquareDashed className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
      <p>{t('empty')}</p>
      <p className="text-sm mt-1">{t('emptyDescription')}</p>
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
  const variableCount = template.variables.length;

  return (
    <TableRow>
      <TableCell className="font-medium">{template.name}</TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground whitespace-pre-line">{template.body}</span>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{t(`categories.${template.category}`)}</Badge>
      </TableCell>
      <TableCell>
        <StatusBadge status={template.status} />
      </TableCell>
      <TableCell className="text-center">{variableCount}</TableCell>
      <TableCell>
        {template.meta_template_id !== null ? (
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
            {template.meta_template_id}
          </code>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        {canManage ? (
          <DeleteTemplateButton
            orgId={orgId}
            slug={slug}
            templateId={template.id}
            templateName={template.name}
          />
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function TemplatesTable({
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('table.name')}</TableHead>
          <TableHead>{t('table.body')}</TableHead>
          <TableHead>{t('table.category')}</TableHead>
          <TableHead>{t('table.status')}</TableHead>
          <TableHead className="text-center">{t('table.variables')}</TableHead>
          <TableHead>{t('table.metaId')}</TableHead>
          <TableHead>{t('table.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
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
      </TableBody>
    </Table>
  );
}

function PageHeader({ slug, canManage, t }: { slug: string; canManage: boolean; t: Translator }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>
      {canManage ? (
        <Link href={`/orgs/${slug}/whatsapp-templates/create`}>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            {t('createButton')}
          </Button>
        </Link>
      ) : null}
    </div>
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <PageHeader slug={slug} canManage={canManage} t={t} />
        <Card className="border-border shadow-lg">
          <CardHeader>
            <CardTitle className="text-foreground">{t('allTemplates')}</CardTitle>
            <CardDescription>{t('countRegistered', { count: templates.length })}</CardDescription>
          </CardHeader>
          <CardContent>
            <TemplatesTable
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
