import { Info, MessageSquareDashed } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import type { WhatsAppChannelConnection, WhatsAppTemplate } from '@/app/lib/whatsappTemplates';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { CreateTemplateTrigger } from './CreateTemplateTrigger';
import { DeleteTemplateButton } from './delete-template-button';
import { StatusDot } from './status-dot';

type Translator = Awaited<ReturnType<typeof getTranslations<'whatsappTemplates'>>>;

interface WhatsAppTemplatesSectionProps {
  tenantId: string;
  orgSlug: string;
  tenantSlug: string;
  templates: WhatsAppTemplate[];
  connections: WhatsAppChannelConnection[];
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
      <span aria-hidden="true" className="text-muted-foreground/40">
        ·
      </span>
      <span>{t(`categories.${template.category}`)}</span>
      <span aria-hidden="true" className="text-muted-foreground/40">
        ·
      </span>
      <span>{t('variableCount', { count: template.variables.length })}</span>
    </div>
  );
}

function PendingTimeline({
  template,
  t,
}: {
  template: WhatsAppTemplate;
  t: Translator;
}) {
  if (template.status !== 'pending') return null;
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Info aria-hidden="true" className="size-3 shrink-0" />
      <span>{formatPendingHint(template.created_at, t)}</span>
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
        <p className="truncate font-mono text-xs font-medium">{template.name}</p>
        <p className="truncate text-xs text-muted-foreground/80">{template.body}</p>
        <TemplateMeta template={template} t={t} />
        <PendingTimeline template={template} t={t} />
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
  tenantId,
  orgSlug,
  tenantSlug,
  connections,
  canManage,
  t,
}: {
  tenantId: string;
  orgSlug: string;
  tenantSlug: string;
  connections: WhatsAppChannelConnection[];
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
        <CreateTemplateTrigger
          tenantId={tenantId}
          orgSlug={orgSlug}
          tenantSlug={tenantSlug}
          connections={connections}
          variant="empty"
        />
      ) : null}
    </div>
  );
}

function TemplatesList({
  templates,
  tenantId,
  orgSlug,
  tenantSlug,
  connections,
  canManage,
  t,
}: {
  templates: WhatsAppTemplate[];
  tenantId: string;
  orgSlug: string;
  tenantSlug: string;
  connections: WhatsAppChannelConnection[];
  canManage: boolean;
  t: Translator;
}) {
  if (templates.length === 0) {
    return (
      <EmptyState
        tenantId={tenantId}
        orgSlug={orgSlug}
        tenantSlug={tenantSlug}
        connections={connections}
        canManage={canManage}
        t={t}
      />
    );
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
  connections,
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
            <CreateTemplateTrigger
              tenantId={tenantId}
              orgSlug={orgSlug}
              tenantSlug={tenantSlug}
              connections={connections}
              variant="header"
            />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <TemplatesList
          templates={templates}
          tenantId={tenantId}
          orgSlug={orgSlug}
          tenantSlug={tenantSlug}
          connections={connections}
          canManage={canManage}
          t={t}
        />
      </CardContent>
    </Card>
  );
}
