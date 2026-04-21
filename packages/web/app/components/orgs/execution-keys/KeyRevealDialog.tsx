'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

interface KeyRevealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fullKey: string;
}

const COPIED_RESET_MS = 2000;

function useKeyCopy(fullKey: string) {
  const t = useTranslations('executionKeys');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(fullKey);
    toast.success(t('keyCopied'));
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }, [fullKey, t]);

  return { handleCopy, copied };
}

function KeyDisplay({ fullKey, onCopy, copied }: { fullKey: string; onCopy: () => void; copied: boolean }) {
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
        className="bg-muted cursor-pointer select-all break-all rounded-md border-l-2 border-l-emerald-500 border p-3 font-mono text-xs"
      >
        {fullKey}
      </div>
      <Button variant="outline" size="sm" onClick={onCopy} className="self-end transition-colors">
        {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
        {copied ? t('keyCopied') : t('copyKey')}
      </Button>
    </div>
  );
}

export function KeyRevealDialog({ open, onOpenChange, fullKey }: KeyRevealDialogProps) {
  const t = useTranslations('executionKeys');
  const { handleCopy, copied } = useKeyCopy(fullKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('keyCreated')}</DialogTitle>
          <DialogDescription>{t('keyCreatedDescription')}</DialogDescription>
        </DialogHeader>
        <KeyDisplay fullKey={fullKey} onCopy={handleCopy} copied={copied} />
      </DialogContent>
    </Dialog>
  );
}
