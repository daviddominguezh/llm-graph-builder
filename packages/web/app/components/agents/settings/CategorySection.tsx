'use client';

import { updateCategoryAction } from '@/app/actions/agentSettings';
import { TEMPLATE_CATEGORIES } from '@daviddh/graph-types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

interface CategorySectionProps {
  agentId: string;
  initialCategory: string;
}

const VALID_CATEGORIES = new Set<string>(TEMPLATE_CATEGORIES);

export function CategorySection({ agentId, initialCategory }: CategorySectionProps) {
  const t = useTranslations('settings');
  const tc = useTranslations('categories');
  const startValue = VALID_CATEGORIES.has(initialCategory) ? initialCategory : '';
  const [value, setValue] = useState(startValue);
  const [saving, setSaving] = useState(false);
  const unchanged = value === startValue;

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
    <div className="flex flex-col gap-1.5">
      <Label>{t('category')}</Label>
      <Select value={value === '' ? null : value} onValueChange={(v) => v !== null && setValue(v)}>
        <SelectTrigger className="w-full">
          <SelectValue>
            {value !== '' ? tc(value) : <span className="text-muted-foreground">{t('categoryPlaceholder')}</span>}
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="end" style={{ maxHeight: '30vh' }}>
          {TEMPLATE_CATEGORIES.map((cat) => (
            <SelectItem key={cat} value={cat}>
              {tc(cat)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={handleSave} disabled={unchanged || saving} className="mt-1 self-end">
        {saving ? <Loader2 className="size-4 animate-spin" /> : t('save')}
      </Button>
    </div>
  );
}
