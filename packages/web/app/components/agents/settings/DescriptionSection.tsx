'use client';

import { updateDescriptionAction } from '@/app/actions/agentSettings';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

interface DescriptionSectionProps {
  agentId: string;
  initialDescription: string;
}

export function DescriptionSection({ agentId, initialDescription }: DescriptionSectionProps) {
  const t = useTranslations('settings');
  const [value, setValue] = useState(initialDescription);
  const [saving, setSaving] = useState(false);
  const unchanged = value === initialDescription;

  async function handleSave() {
    setSaving(true);
    const { error } = await updateDescriptionAction(agentId, value);
    setSaving(false);

    if (error !== null) {
      toast.error(error);
      return;
    }

    toast.success(t('saved'));
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{t('description')}</Label>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('descriptionPlaceholder')}
        rows={3}
      />
      <Button size="sm" onClick={handleSave} disabled={unchanged || saving} className="self-end">
        {saving ? t('saving') : t('save')}
      </Button>
    </div>
  );
}
