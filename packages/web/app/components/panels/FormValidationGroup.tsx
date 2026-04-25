'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface Props {
  path: string;
  kind: 'array' | 'object';
  children: ReactNode;
  configuredCount: number;
  totalCount: number;
  indent?: number;
}

const INDENT_PX = 16;

export function FormValidationGroup({
  path,
  kind,
  children,
  configuredCount,
  totalCount,
  indent = 0,
}: Props): JSX.Element {
  const t = useTranslations('forms.validations');
  const [open, setOpen] = useState(true);
  const arraySuffix = kind === 'array' ? '[]' : '';
  return (
    <>
      <button
        type="button"
        onClick={(): void => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-1 text-xs"
        style={{ paddingLeft: indent * INDENT_PX }}
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <code>
          {path}
          {arraySuffix}
        </code>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
          {kind}
        </span>
        <span className="ml-auto text-muted-foreground">
          {t('parentCount', { configured: configuredCount, total: totalCount })}
        </span>
      </button>
      {open && <div>{children}</div>}
    </>
  );
}
