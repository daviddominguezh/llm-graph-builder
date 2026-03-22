'use client';

interface JsonBlockProps {
  label: string;
  data: unknown;
}

const JSON_INDENT = 2;

export function JsonBlock({ label, data }: JsonBlockProps) {
  if (data === null || data === undefined) return null;

  const text = typeof data === 'string' ? data : JSON.stringify(data, null, JSON_INDENT);

  return (
    <details className="group">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        {label}
      </summary>
      <pre className="mt-1 overflow-auto max-h-96 rounded-md border bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-words">
        {text}
      </pre>
    </details>
  );
}
