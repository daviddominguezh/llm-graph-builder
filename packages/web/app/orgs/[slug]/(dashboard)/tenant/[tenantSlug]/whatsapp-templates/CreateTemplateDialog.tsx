'use client';

import type { WhatsAppChannelConnection } from '@/app/lib/whatsappTemplates';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Link2Off, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

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

function EmptyConnections() {
  const t = useTranslations('whatsappTemplates');
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-background py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
        <Link2Off className="size-5 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t('create.noConnections')}</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          {t('create.noConnectionsDescription')}
        </p>
      </div>
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
      <Separator className="mt-3 mb-6" />
      {connections.length === 0 ? (
        <EmptyConnections />
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div aria-hidden="true" className="fixed inset-0 bg-black/80" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[85vh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-md bg-popover p-4 text-xs/relaxed ring-1 ring-border shadow-lg"
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
