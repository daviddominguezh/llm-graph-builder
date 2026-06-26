'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';

interface MessageStepProps {
  value: string;
  onChange: (next: string) => void;
}

export function MessageStep({ value, onChange }: MessageStepProps) {
  const t = useTranslations('editor.triggers');
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="trigger-message">{t('messageLabel')}</Label>
      <Textarea
        id="trigger-message"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('messagePlaceholder')}
        rows={5}
      />
      <span className="text-xs text-muted-foreground">{t('previewApproximate')}</span>
    </div>
  );
}
