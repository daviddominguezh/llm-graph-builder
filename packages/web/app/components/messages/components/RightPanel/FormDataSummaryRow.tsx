'use client';

import type { OutputSchemaField } from '@daviddh/graph-types';
import {
  type FailedAttempt,
  type FormData,
  collectFieldPaths,
  readFormField,
} from '@daviddh/llm-graph-runner';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { type ReactElement, useEffect, useState } from 'react';

import { FormDataExpandedView } from './FormDataExpandedView';
import { FormDataFailedAttempts } from './FormDataFailedAttempts';

interface Props {
  formId: string;
  slug: string;
  displayName?: string;
  schema: OutputSchemaField[];
  data: FormData | undefined;
  failedAttempts: FailedAttempt[];
  editFormHref: string;
}

const STORAGE_PREFIX = 'forms.rightPanel.expanded.';

export function FormDataSummaryRow({
  formId,
  slug,
  displayName,
  schema,
  data,
  failedAttempts,
  editFormHref,
}: Props): ReactElement {
  const t = useTranslations('forms.rightPanel');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${formId}`);
    if (stored === '1') setExpanded(true);
  }, [formId]);

  const toggle = (): void => {
    const next = !expanded;
    setExpanded(next);
    window.localStorage.setItem(`${STORAGE_PREFIX}${formId}`, next ? '1' : '0');
  };

  const counts = computeCounts(schema, data);
  const label = displayName ?? slug;

  return (
    <div className="flex flex-col gap-1">
      <SummaryHeader
        expanded={expanded}
        label={label}
        progressLabel={t('summary.progress', counts)}
        editLabel={t('editForm')}
        editHref={editFormHref}
        onToggle={toggle}
      />
      {expanded && (
        <>
          <FormDataExpandedView schema={schema} data={data} />
          <FormDataFailedAttempts attempts={failedAttempts} />
        </>
      )}
    </div>
  );
}

interface HeaderProps {
  expanded: boolean;
  label: string;
  progressLabel: string;
  editLabel: string;
  editHref: string;
  onToggle: () => void;
}

function SummaryHeader({
  expanded,
  label,
  progressLabel,
  editLabel,
  editHref,
  onToggle,
}: HeaderProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex items-center gap-1 text-xs"
    >
      {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
      <code className="font-medium">{label}</code>
      <span className="text-muted-foreground">{progressLabel}</span>
      <Link
        href={editHref}
        className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground"
        onClick={(e): void => e.stopPropagation()}
      >
        {editLabel} <ExternalLink className="size-3" />
      </Link>
    </button>
  );
}

function computeCounts(
  schema: OutputSchemaField[],
  data: FormData | undefined
): { filled: number; total: number } {
  const paths = collectFieldPaths(schema);
  let filled = 0;
  for (const path of paths) {
    const r = readFormField(data, path);
    if (r.ok && r.value !== undefined) filled += 1;
  }
  return { filled, total: paths.length };
}
