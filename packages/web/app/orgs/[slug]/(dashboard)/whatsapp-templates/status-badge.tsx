import { useTranslations } from 'next-intl';

import type { WhatsAppTemplateStatus } from '@/app/lib/whatsappTemplates';
import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: WhatsAppTemplateStatus;
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const STATUS_VARIANT_MAP: Record<WhatsAppTemplateStatus, BadgeVariant> = {
  approved: 'default',
  pending: 'secondary',
  rejected: 'destructive',
  paused: 'outline',
  deactivated: 'destructive',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const t = useTranslations('whatsappTemplates.status');
  return <Badge variant={STATUS_VARIANT_MAP[status]}>{t(status)}</Badge>;
}
