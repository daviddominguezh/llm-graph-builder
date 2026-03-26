'use client';

import { updateCategoryAction } from '@/app/actions/agentSettings';
import { TEMPLATE_CATEGORIES } from '@daviddh/graph-types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

interface CategorySectionProps {
  agentId: string;
  initialCategory: string;
}

export function CategorySection({ agentId, initialCategory }: CategorySectionProps) {
  const t = useTranslations('settings');
  const tc = useTranslations('categories');
  const [value, setValue] = useState(initialCategory);
  const [saving, setSaving] = useState(false);
  const unchanged = value === initialCategory;

  async function handleSave() {
    setSaving(true);
    const { error } = await updateCategoryAction(agentId, value);
    setSaving(false);

    if (error !== null) {
      toast.error(error);
      return;
    }

    toast.success(t('saved'));
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{t('category')}</Label>
      <Select value={value} onValueChange={(v) => v !== null && setValue(v)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TEMPLATE_CATEGORIES.map((cat) => (
            <SelectItem key={cat} value={cat}>
              {tc(cat)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={handleSave} disabled={unchanged || saving} className="self-end">
        {t('save')}
      </Button>
    </div>
  );
}
