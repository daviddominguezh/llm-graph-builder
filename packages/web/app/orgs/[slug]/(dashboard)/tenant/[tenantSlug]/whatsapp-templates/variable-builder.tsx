'use client';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { WhatsAppTemplateVariable } from '@/app/lib/whatsappTemplates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface VariableBuilderProps {
  value: WhatsAppTemplateVariable[];
  onChange: (variables: WhatsAppTemplateVariable[]) => void;
}

const KEY_PLACEHOLDER = '1';
const NAME_PLACEHOLDER = 'recipient_name';
const EXAMPLE_PLACEHOLDER = 'John';

export function makeAddHandler(
  value: WhatsAppTemplateVariable[],
  onChange: (variables: WhatsAppTemplateVariable[]) => void
): () => void {
  return () => {
    const nextKey = String(value.length + 1);
    onChange([...value, { key: nextKey, name: '', example: '', required: true }]);
  };
}

function updateVariableAtIndex(
  variables: WhatsAppTemplateVariable[],
  index: number,
  updates: Partial<WhatsAppTemplateVariable>
): WhatsAppTemplateVariable[] {
  return variables.map((v, i) => (i === index ? { ...v, ...updates } : v));
}

function ColumnHeaders() {
  const t = useTranslations('whatsappTemplates.variableBuilder');
  return (
    <div className="flex items-center gap-2 px-0.5 text-[11px] text-muted-foreground">
      <span className="w-16 shrink-0">{t('keyLabel')}</span>
      <span className="flex-1">{t('nameLabel')}</span>
      <span className="flex-1">{t('exampleLabel')}</span>
      <span className="w-7 shrink-0" aria-hidden="true" />
    </div>
  );
}

function VariableRow({
  variable,
  index,
  onUpdate,
  onRemove,
  removeLabel,
}: {
  variable: WhatsAppTemplateVariable;
  index: number;
  onUpdate: (index: number, updates: Partial<WhatsAppTemplateVariable>) => void;
  onRemove: (index: number) => void;
  removeLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label={`key-${String(index)}`}
        value={variable.key}
        onChange={(e) => onUpdate(index, { key: e.target.value })}
        placeholder={KEY_PLACEHOLDER}
        className="w-16 shrink-0 font-mono"
      />
      <Input
        aria-label={`name-${String(index)}`}
        value={variable.name}
        onChange={(e) => onUpdate(index, { name: e.target.value })}
        placeholder={NAME_PLACEHOLDER}
        className="flex-1 font-mono"
      />
      <Input
        aria-label={`example-${String(index)}`}
        value={variable.example}
        onChange={(e) => onUpdate(index, { example: e.target.value })}
        placeholder={EXAMPLE_PLACEHOLDER}
        className="flex-1"
      />
      <Button
        type="button"
        variant="destructive"
        aria-label={removeLabel}
        onClick={() => onRemove(index)}
        className="h-7 w-7 shrink-0 p-0"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

export function VariableBuilder({ value, onChange }: VariableBuilderProps) {
  const t = useTranslations('whatsappTemplates.variableBuilder');

  function handleUpdate(index: number, updates: Partial<WhatsAppTemplateVariable>) {
    onChange(updateVariableAtIndex(value, index, updates));
  }

  function handleRemove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  if (value.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <ColumnHeaders />
      {value.map((variable, index) => (
        <VariableRow
          key={`${variable.key}-${String(index)}`}
          variable={variable}
          index={index}
          onUpdate={handleUpdate}
          onRemove={handleRemove}
          removeLabel={t('remove')}
        />
      ))}
    </div>
  );
}
