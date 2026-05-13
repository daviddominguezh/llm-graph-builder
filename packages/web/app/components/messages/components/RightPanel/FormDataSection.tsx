'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import {
  collectFieldPaths,
  readFormField,
  type FailedAttempt,
  type FormData,
  type FormDefinition,
} from '@daviddh/llm-graph-runner';

import { FormDataSummaryRow } from './FormDataSummaryRow';

interface Props {
  agentSlug: string;
  orgSlug: string;
  forms: FormDefinition[];
  formData: Record<string, FormData>;
  diagnostics: Record<string, { lastFailures: FailedAttempt[] }>;
}

export function FormDataSection({
  agentSlug,
  orgSlug,
  forms,
  formData,
  diagnostics,
}: Props): ReactElement | null {
  const t = useTranslations('forms.rightPanel');
  if (forms.length === 0) return null;
  const { filled, total } = computeRollup(forms, formData);
  return (
    <section className="flex flex-col gap-2 px-3 py-2">
      <SectionHeader title={t('title')} badge={t('rollupBadge', { filled, total })} />
      {forms.map((f) => (
        <FormDataSummaryRow
          key={f.id}
          formId={f.id}
          slug={f.formSlug}
          displayName={f.displayName}
          schema={f.schemaFields}
          data={formData[f.id]}
          failedAttempts={diagnostics[f.id]?.lastFailures ?? []}
          editFormHref={buildEditHref(orgSlug, agentSlug, f.id)}
        />
      ))}
    </section>
  );
}

function SectionHeader({ title, badge }: { title: string; badge: string }): ReactElement {
  return (
    <header className="flex items-center gap-2">
      <h4 className="text-xs font-medium">{title}</h4>
      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{badge}</span>
    </header>
  );
}

function computeRollup(
  forms: FormDefinition[],
  formData: Record<string, FormData>
): { filled: number; total: number } {
  let filled = 0;
  let total = 0;
  for (const f of forms) {
    const paths = collectFieldPaths(f.schemaFields);
    total += paths.length;
    for (const p of paths) {
      const r = readFormField(formData[f.id], p);
      if (r.ok && r.value !== undefined) filled += 1;
    }
  }
  return { filled, total };
}

function buildEditHref(orgSlug: string, agentSlug: string, formId: string): string {
  return `/orgs/${orgSlug}/editor/${agentSlug}?dataTab=forms&form=${formId}`;
}
