'use client';

import { WhatsAppConnect } from '@/app/components/messages/integrations/WhatsAppConnect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useWhatsAppStatus } from './useChannelStatus';

interface ChannelCellProps {
  tenantId: string;
  channelKey: string;
  agentId: string;
}

function ConnectedBadge({ phone }: { phone: string | null }) {
  const t = useTranslations('editor.channels');

  return (
    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
      <CheckCircle2 className="size-3" />
      {phone ? phone : t('connected')}
    </Badge>
  );
}

function WhatsAppCell({ tenantId, agentId }: { tenantId: string; agentId: string }) {
  const { connected, phone, loading, refresh } = useWhatsAppStatus(tenantId);

  if (loading) {
    return <Loader2 className="size-4 animate-spin text-muted-foreground mx-auto" />;
  }

  if (connected) {
    return <ConnectedBadge phone={phone} />;
  }

  return <WhatsAppConnect tenantId={tenantId} agentId={agentId} onSuccess={refresh} />;
}

function StubConnectButton() {
  const t = useTranslations('editor.channels');

  return (
    <Button variant="outline" size="xs" disabled>
      {t('connect')}
    </Button>
  );
}

export function ChannelCell({ tenantId, channelKey, agentId }: ChannelCellProps) {
  if (channelKey === 'whatsapp') {
    return <WhatsAppCell tenantId={tenantId} agentId={agentId} />;
  }

  return <StubConnectButton />;
}
