'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { WhatsAppChannelConnection } from '@/app/lib/whatsappTemplates';
import { Button } from '@/components/ui/button';

import { CreateTemplateForm } from './CreateTemplateForm';

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  orgSlug: string;
  tenantSlug: string;
  connections: WhatsAppChannelConnection[];
}

function useBodyPortal(open: boolean): HTMLElement | null {
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setNode(document.body);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return node;
}

function EmptyConnections({ onClose }: { onClose: () => void }) {
  const t = useTranslations('whatsappTemplates');
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed bg-background px-4 py-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t('create.noConnections')}</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {t('create.noConnectionsDescription')}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-[0.5px] rounded-md"
        onClick={onClose}
      >
        {t('create.back')}
      </Button>
    </div>
  );
}

function DialogBody({
  tenantId,
  orgSlug,
  tenantSlug,
  connections,
  onClose,
}: {
  tenantId: string;
  orgSlug: string;
  tenantSlug: string;
  connections: WhatsAppChannelConnection[];
  onClose: () => void;
}) {
  const t = useTranslations('whatsappTemplates');
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">{t('create.pageTitle')}</h2>
          <p className="text-xs text-muted-foreground">{t('create.pageSubtitle')}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          aria-label="Close"
          className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {connections.length === 0 ? (
        <EmptyConnections onClose={onClose} />
      ) : (
        <CreateTemplateForm
          tenantId={tenantId}
          orgSlug={orgSlug}
          tenantSlug={tenantSlug}
          connections={connections}
          onSuccess={onClose}
          onCancel={onClose}
        />
      )}
    </>
  );
}

export function CreateTemplateDialog({
  open,
  onOpenChange,
  tenantId,
  orgSlug,
  tenantSlug,
  connections,
}: CreateTemplateDialogProps) {
  const bodyNode = useBodyPortal(open);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open || bodyNode === null) return null;

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div aria-hidden="true" className="fixed inset-0 bg-black/80" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-[101] flex max-h-[85vh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-md bg-popover p-4 text-xs/relaxed ring-1 ring-border shadow-lg"
      >
        <DialogBody
          tenantId={tenantId}
          orgSlug={orgSlug}
          tenantSlug={tenantSlug}
          connections={connections}
          onClose={() => onOpenChange(false)}
        />
      </div>
    </div>,
    bodyNode
  );
}
