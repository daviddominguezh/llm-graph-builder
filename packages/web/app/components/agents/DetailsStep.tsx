'use client';

import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { TemplateCategory } from '@daviddh/graph-types';
import { TEMPLATE_CATEGORIES } from '@daviddh/graph-types';
import { Globe, Lock } from 'lucide-react';
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

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="wizard-description">{t('description')}</Label>
      <Textarea
        id="wizard-description"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('descriptionPlaceholder')}
        required
      />
    </div>
  );
}

function CategoryField({
  value,
  onChange,
}: {
  value: TemplateCategory;
  onChange: (v: TemplateCategory) => void;
}) {
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

function VisibilityOption({
  selected,
  onClick,
  icon,
  label,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  const border = selected ? 'border-primary ring-1 ring-primary' : 'border-border';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left transition-[border-color,box-shadow] duration-150 hover:bg-card/60 ${border}`}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </button>
  );
}

function VisibilityCards({ isPublic, onChange }: { isPublic: boolean; onChange: (v: boolean) => void }) {
  const t = useTranslations('settings');
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{t('visibility')}</Label>
      <div className="flex gap-2">
        <VisibilityOption
          selected={!isPublic}
          onClick={() => onChange(false)}
          icon={<Lock className="size-3.5 text-muted-foreground" />}
          label={t('visibilityPrivate')}
          description={t('privateDescription')}
        />
        <VisibilityOption
          selected={isPublic}
          onClick={() => onChange(true)}
          icon={<Globe className="size-3.5 text-green-600 dark:text-green-400" />}
          label={t('visibilityPublic')}
          description={t('publicDescription')}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Details fields group                                               */
/* ------------------------------------------------------------------ */

function DetailsFields({ state, onChange }: DetailsFieldsProps) {
  return (
    <div className="flex flex-col gap-5">
      <NameField value={state.name} onChange={(name) => onChange({ ...state, name })} />
      <DescriptionField
        value={state.description}
        onChange={(description) => onChange({ ...state, description })}
      />
      <CategoryField value={state.category} onChange={(category) => onChange({ ...state, category })} />
      <VisibilityCards isPublic={state.isPublic} onChange={(isPublic) => onChange({ ...state, isPublic })} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer                                                             */
/* ------------------------------------------------------------------ */

function DetailsFooter({
  onBack,
  onSubmit,
  loading,
  disabled,
}: {
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  const t = useTranslations('marketplace');
  const tAgents = useTranslations('agents');

  return (
    <DialogFooter className='mt-4.5'>
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
  const canSubmit = state.name.trim() !== '' && state.description.trim() !== '' && !loading;

  return (
    <>
      <DetailsFields state={state} onChange={onChange} />
      <DetailsFooter onBack={onBack} onSubmit={onSubmit} loading={loading} disabled={!canSubmit} />
    </>
  );
}
