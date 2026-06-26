'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactElement } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { listFormsAction } from '@/app/actions/forms';

interface FormOption {
  id: string;
  slug: string;
  displayName: string;
}

interface ExportCsvFormSelectProps {
  agentId: string | null;
  value: string | null;
  onChange: (formSlug: string) => void;
}

export function ExportCsvFormSelect({
  agentId,
  value,
  onChange,
}: ExportCsvFormSelectProps): ReactElement {
  const t = useTranslations('forms.export.form');
  const [forms, setForms] = useState<FormOption[]>([]);

  useEffect(() => {
    if (agentId === null) {
      return undefined;
    }
    let cancelled = false;
    listFormsAction(agentId)
      .then((rows) => {
        if (cancelled) return;
        setForms(
          rows.map((r) => ({
            id: r.id,
            slug: r.slug,
            displayName: r.displayName,
          }))
        );
      })
      .catch(() => undefined);
    return (): void => {
      cancelled = true;
    };
  }, [agentId]);

  return (
    <div className="flex flex-col gap-1">
      <Label>{t('label')}</Label>
      <Select
        disabled={agentId === null}
        value={value ?? ''}
        onValueChange={(v: string | null): void => {
          if (v !== null && v !== '') onChange(v);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue>
            {value !== null && value !== ''
              ? (forms.find((f) => f.slug === value)?.displayName ?? value)
              : '—'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {forms.map((f) => (
            <SelectItem key={f.id} value={f.slug}>
              {f.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
