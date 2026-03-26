'use client';

import { useCallback } from 'react';

import { CopyJsonButton } from '@/app/components/panels/CopyJsonButton';

interface JsonBlockProps {
  label: string;
  data: unknown;
}

const JSON_INDENT = 2;

function stringify(data: unknown): string {
  return typeof data === 'string' ? data : JSON.stringify(data, null, JSON_INDENT);
}

export function JsonBlock({ label, data }: JsonBlockProps) {
  const getText = useCallback(() => stringify(data), [data]);

  if (data === null || data === undefined) return null;

  return (
    <details className="group">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        {label}
      </summary>
      <div className="relative mt-1">
        <CopyJsonButton getValue={getText} />
        <pre className="overflow-auto max-h-96 rounded-md border bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-words">
          {stringify(data)}
        </pre>
      </div>
    </details>
  );
}
