'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { WhatsAppChannelConnection } from '@/app/lib/whatsappTemplates';
import { Button } from '@/components/ui/button';

import { CreateTemplateDialog } from './CreateTemplateDialog';

interface CreateTemplateTriggerProps {
  tenantId: string;
  orgSlug: string;
  tenantSlug: string;
  connections: WhatsAppChannelConnection[];
  variant?: 'header' | 'empty';
}

export function CreateTemplateTrigger({
  tenantId,
  orgSlug,
  tenantSlug,
  connections,
  variant = 'header',
}: CreateTemplateTriggerProps) {
  const t = useTranslations('whatsappTemplates');
  const [open, setOpen] = useState(false);

  const buttonProps =
    variant === 'header'
      ? { variant: 'outline' as const, className: 'border-[0.5px] rounded-md', size: 'sm' as const }
      : { className: 'mt-1 rounded-full', size: 'sm' as const };

  return (
    <>
      <Button {...buttonProps} onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        {t('createButton')}
      </Button>
      <CreateTemplateDialog
        open={open}
        onOpenChange={setOpen}
        tenantId={tenantId}
        orgSlug={orgSlug}
        tenantSlug={tenantSlug}
        connections={connections}
      />
    </>
  );
}
