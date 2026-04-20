import { MessageSquareDashed, Plus } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import type { WhatsAppTemplate } from '@/app/lib/whatsappTemplates';
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
import { StatusDot } from './status-dot';

type Translator = Awaited<ReturnType<typeof getTranslations<'whatsappTemplates'>>>;

interface WhatsAppTemplatesSectionProps {
  tenantId: string;
  orgSlug: string;
  tenantSlug: string;
  templates: WhatsAppTemplate[];
  canManage: boolean;
}

function formatPendingHint(createdAt: string, t: Translator): string {
  const minutesPerHour = 60;
  const minutesPerDay = 60 * 24;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageMin = Math.max(0, Math.floor(ageMs / 60_000));

  if (ageMin < 1) return t('pendingTimeline.justSubmitted');
  if (ageMin < minutesPerHour) {
    return t('pendingTimeline.minutes', { count: ageMin });
  }
  if (ageMin < minutesPerDay) {
    return t('pendingTimeline.hours', { count: Math.floor(ageMin / minutesPerHour) });
  }
  return t('pendingTimeline.days', { count: Math.floor(ageMin / minutesPerDay) });
}

function TemplateMeta({ template, t }: { template: WhatsAppTemplate; t: Translator }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <StatusDot status={template.status} />
      <span className="text-muted-foreground/40">·</span>
      <span>{t(`categories.${template.category}`)}</span>
      <span className="text-muted-foreground/40">·</span>
      <span>{t('variableCount', { count: template.variables.length })}</span>
      {template.status === 'pending' ? (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span>{formatPendingHint(template.created_at, t)}</span>
        </>
      ) : null}
    </div>
  );
}

function TemplateRowItem({
  template,
  tenantId,
  orgSlug,
  tenantSlug,
  canManage,
  t,
}: {
  template: WhatsAppTemplate;
  tenantId: string;
  orgSlug: string;
  tenantSlug: string;
  canManage: boolean;
  t: Translator;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-transparent bg-card px-3 py-2 dark:bg-input/30">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium">{template.name}</p>
        <p className="truncate text-xs text-muted-foreground/80">{template.body}</p>
        <TemplateMeta template={template} t={t} />
      </div>
      {canManage ? (
        <DeleteTemplateButton
          tenantId={tenantId}
          orgSlug={orgSlug}
          tenantSlug={tenantSlug}
          templateId={template.id}
          templateName={template.name}
        />
      ) : null}
    </div>
  );
}

function EmptyState({
  orgSlug,
  tenantSlug,
  canManage,
  t,
}: {
  orgSlug: string;
  tenantSlug: string;
  canManage: boolean;
  t: Translator;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed bg-background px-4 py-8 text-center">
      <MessageSquareDashed className="size-6 text-muted-foreground/50" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t('empty')}</p>
        <p className="max-w-xs text-xs text-muted-foreground">{t('emptyDescription')}</p>
      </div>
      {canManage ? (
        <Link href={`/orgs/${orgSlug}/${tenantSlug}/whatsapp-templates/create`}>
          <Button size="sm" className="mt-1 rounded-full">
            <Plus className="size-3.5" />
            {t('createButton')}
          </Button>
        </Link>
      ) : null}
    </div>
  );
}

function TemplatesList({
  templates,
  tenantId,
  orgSlug,
  tenantSlug,
  canManage,
  t,
}: {
  templates: WhatsAppTemplate[];
  tenantId: string;
  orgSlug: string;
  tenantSlug: string;
  canManage: boolean;
  t: Translator;
}) {
  if (templates.length === 0) {
    return <EmptyState orgSlug={orgSlug} tenantSlug={tenantSlug} canManage={canManage} t={t} />;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {templates.map((template) => (
        <TemplateRowItem
          key={template.id}
          template={template}
          tenantId={tenantId}
          orgSlug={orgSlug}
          tenantSlug={tenantSlug}
          canManage={canManage}
          t={t}
        />
      ))}
    </div>
  );
}

export async function WhatsAppTemplatesSection({
  tenantId,
  orgSlug,
  tenantSlug,
  templates,
  canManage,
}: WhatsAppTemplatesSectionProps): Promise<React.JSX.Element> {
  const t = await getTranslations('whatsappTemplates');

  return (
    <Card className="bg-transparent ring-0 border-transparent">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
        {canManage && templates.length > 0 ? (
          <CardAction>
            <Link href={`/orgs/${orgSlug}/${tenantSlug}/whatsapp-templates/create`}>
              <Button variant="outline" size="sm" className="border-[0.5px] rounded-md">
                <Plus className="size-3.5" />
                {t('createButton')}
              </Button>
            </Link>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <TemplatesList
          templates={templates}
          tenantId={tenantId}
          orgSlug={orgSlug}
          tenantSlug={tenantSlug}
          canManage={canManage}
          t={t}
        />
      </CardContent>
    </Card>
  );
}
