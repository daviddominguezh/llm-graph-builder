import { useTranslations } from 'next-intl';

import type { WhatsAppTemplateStatus } from '@/app/lib/whatsappTemplates';

interface StatusDotProps {
  status: WhatsAppTemplateStatus;
}

const DOT_CLASS: Record<WhatsAppTemplateStatus, string> = {
  approved: 'bg-emerald-500',
  pending: 'bg-amber-500',
  rejected: 'bg-destructive',
  paused: 'bg-muted-foreground/60',
  deactivated: 'bg-destructive/60',
};

export function StatusDot({ status }: StatusDotProps) {
  const t = useTranslations('whatsappTemplates.status');
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground">
      <span
        aria-hidden="true"
        className={`inline-block size-1.5 shrink-0 rounded-full ${DOT_CLASS[status]}`}
      />
      <span>{t(status)}</span>
    </span>
  );
}
