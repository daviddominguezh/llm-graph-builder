'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { WhatsAppTemplateVariable } from '@/app/lib/whatsappTemplates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface VariableBuilderProps {
  value: WhatsAppTemplateVariable[];
  onChange: (variables: WhatsAppTemplateVariable[]) => void;
}

const KEY_PLACEHOLDER = '1';
const NAME_PLACEHOLDER = 'recipient_name';
const EXAMPLE_PLACEHOLDER = 'John';

function updateVariableAtIndex(
  variables: WhatsAppTemplateVariable[],
  index: number,
  updates: Partial<WhatsAppTemplateVariable>
): WhatsAppTemplateVariable[] {
  return variables.map((v, i) => (i === index ? { ...v, ...updates } : v));
}

function VariableRow({
  variable,
  index,
  onUpdate,
  onRemove,
}: {
  variable: WhatsAppTemplateVariable;
  index: number;
  onUpdate: (index: number, updates: Partial<WhatsAppTemplateVariable>) => void;
  onRemove: (index: number) => void;
}) {
  const t = useTranslations('whatsappTemplates.variableBuilder');
  return (
    <div className="flex items-end gap-3">
      <div className="w-20">
        <Label htmlFor={`var-key-${String(index)}`}>{t('keyLabel')}</Label>
        <Input
          id={`var-key-${String(index)}`}
          value={variable.key}
          onChange={(e) => onUpdate(index, { key: e.target.value })}
          placeholder={KEY_PLACEHOLDER}
        />
      </div>

      <div className="flex-1">
        <Label htmlFor={`var-name-${String(index)}`}>{t('nameLabel')}</Label>
        <Input
          id={`var-name-${String(index)}`}
          value={variable.name}
          onChange={(e) => onUpdate(index, { name: e.target.value })}
          placeholder={NAME_PLACEHOLDER}
        />
      </div>

      <div className="flex-1">
        <Label htmlFor={`var-example-${String(index)}`}>{t('exampleLabel')}</Label>
        <Input
          id={`var-example-${String(index)}`}
          value={variable.example}
          onChange={(e) => onUpdate(index, { example: e.target.value })}
          placeholder={EXAMPLE_PLACEHOLDER}
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(index)}
        className="mb-0.5 text-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
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

  function handleAdd() {
    const nextKey = String(value.length + 1);
    onChange([...value, { key: nextKey, name: '', example: '', required: true }]);
  }

  return (
    <div className="space-y-3">
      {value.map((variable, index) => (
        <VariableRow
          key={`${variable.key}-${String(index)}`}
          variable={variable}
          index={index}
          onUpdate={handleUpdate}
          onRemove={handleRemove}
        />
      ))}

      <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
        <Plus className="mr-1 h-4 w-4" />
        {t('add')}
      </Button>
    </div>
  );
}
