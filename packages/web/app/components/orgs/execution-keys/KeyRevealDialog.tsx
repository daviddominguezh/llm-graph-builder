'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';
import { toast } from 'sonner';

interface KeyRevealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fullKey: string;
}

function useKeyCopy(fullKey: string) {
  const t = useTranslations('executionKeys');

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(fullKey);
    toast.success(t('keyCopied'));
  }, [fullKey, t]);

  return handleCopy;
}

function KeyDisplay({ fullKey, onCopy }: { fullKey: string; onCopy: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations('executionKeys');

  function handleClick() {
    if (ref.current === null) return;
    const range = document.createRange();
    range.selectNodeContents(ref.current);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={ref}
        onClick={handleClick}
        className="bg-muted cursor-pointer select-all break-all rounded-md border p-3 font-mono text-xs"
      >
        {fullKey}
      </div>
      <Button variant="outline" size="sm" onClick={onCopy} className="self-end">
        <Copy className="size-4" />
        {t('copyKey')}
      </Button>
    </div>
  );
}

export function KeyRevealDialog({ open, onOpenChange, fullKey }: KeyRevealDialogProps) {
  const t = useTranslations('executionKeys');
  const handleCopy = useKeyCopy(fullKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('keyCreated')}</DialogTitle>
          <DialogDescription>{t('keyCreatedDescription')}</DialogDescription>
        </DialogHeader>
        <KeyDisplay fullKey={fullKey} onCopy={handleCopy} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('deleteCancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
