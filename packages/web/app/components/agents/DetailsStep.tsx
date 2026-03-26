'use client';

import type { TemplateCategory } from '@daviddh/graph-types';
import { TEMPLATE_CATEGORIES } from '@daviddh/graph-types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DetailsFormState {
  name: string;
  description: string;
  category: TemplateCategory;
  isPublic: boolean;
}

interface DetailsFieldsProps {
  state: DetailsFormState;
  onChange: (next: DetailsFormState) => void;
}

interface DetailsStepProps {
  state: DetailsFormState;
  onChange: (next: DetailsFormState) => void;
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
}

/* ------------------------------------------------------------------ */
/*  Fields                                                             */
/* ------------------------------------------------------------------ */

function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations('agents');

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="wizard-name">{t('name')}</Label>
      <Input
        id="wizard-name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('namePlaceholder')}
        required
      />
    </div>
  );
}

function DescriptionField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="wizard-description">
        {t('description')} <span className="text-muted-foreground font-normal">({tCommon('optional')})</span>
      </Label>
      <Textarea
        id="wizard-description"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('descriptionPlaceholder')}
      />
    </div>
  );
}

function CategoryField({ value, onChange }: { value: TemplateCategory; onChange: (v: TemplateCategory) => void }) {
  const t = useTranslations('settings');
  const tc = useTranslations('categories');

  return (
    <div className="flex flex-col gap-1">
      <Label>{t('category')}</Label>
      <Select value={value} onValueChange={(v) => v !== null && onChange(v as TemplateCategory)}>
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
    </div>
  );
}

function PublicCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const t = useTranslations('settings');

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Checkbox id="wizard-public" checked={checked} onCheckedChange={onChange} />
        <Label htmlFor="wizard-public">{t('visibilityPublic')}</Label>
      </div>
      <p className="text-muted-foreground text-xs">{t('publicExplanation')}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Details fields group                                               */
/* ------------------------------------------------------------------ */

function DetailsFields({ state, onChange }: DetailsFieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      <NameField value={state.name} onChange={(name) => onChange({ ...state, name })} />
      <DescriptionField
        value={state.description}
        onChange={(description) => onChange({ ...state, description })}
      />
      <CategoryField
        value={state.category}
        onChange={(category) => onChange({ ...state, category })}
      />
      <PublicCheckbox checked={state.isPublic} onChange={(isPublic) => onChange({ ...state, isPublic })} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer                                                             */
/* ------------------------------------------------------------------ */

function DetailsFooter({ onBack, onSubmit, loading, disabled }: {
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  const t = useTranslations('marketplace');
  const tAgents = useTranslations('agents');

  return (
    <DialogFooter>
      <Button variant="outline" onClick={onBack} disabled={loading}>
        {t('back')}
      </Button>
      <Button onClick={onSubmit} disabled={disabled}>
        {loading ? tAgents('creating') : tAgents('create')}
      </Button>
    </DialogFooter>
  );
}

/* ------------------------------------------------------------------ */
/*  DetailsStep                                                        */
/* ------------------------------------------------------------------ */

export function DetailsStep({ state, onChange, onBack, onSubmit, loading }: DetailsStepProps) {
  const canSubmit = state.name.trim() !== '' && !loading;

  return (
    <>
      <DetailsFields state={state} onChange={onChange} />
      <DetailsFooter onBack={onBack} onSubmit={onSubmit} loading={loading} disabled={!canSubmit} />
    </>
  );
}
