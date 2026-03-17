'use client';

import dynamic from 'next/dynamic';

const ReactJson = dynamic(() => import('@microlink/react-json-view'), { ssr: false });

export function isJsonObject(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}

export function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

interface McpContentItem {
  type: string;
  text?: string;
}

function isMcpContentResult(value: unknown): value is { content: McpContentItem[] } {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return Array.isArray(obj['content']);
}

export function extractMcpPayload(value: unknown): unknown {
  if (!isMcpContentResult(value)) return value;
  const items = value.content.filter((c) => c.type === 'text' && typeof c.text === 'string');
  if (items.length === 1 && items[0]?.text !== undefined) {
    return tryParseJson(items[0].text) ?? items[0].text;
  }
  if (items.length > 1) {
    return items.map((c) => tryParseJson(c.text ?? '') ?? c.text);
  }
  return value;
}

export function JsonBlock({ value }: { value: Record<string, unknown> | unknown[] }) {
  return (
    <div className="rounded-lg bg-muted/50 p-4 text-[11px]">
      <ReactJson
        src={value}
        name={false}
        theme="rjv-default"
        displayDataTypes={false}
        displayObjectSize={false}
        enableClipboard={false}
        collapsed={2}
        style={{ backgroundColor: 'transparent', fontFamily: 'var(--font-mono, monospace)' }}
      />
    </div>
  );
}

export function SmallJsonBlock({ value }: { value: Record<string, unknown> | unknown[] }) {
  return (
    <div className="rounded bg-muted/50 p-1.5 text-[10px]">
      <ReactJson
        src={value}
        name={false}
        theme="rjv-default"
        displayDataTypes={false}
        displayObjectSize={false}
        enableClipboard={false}
        collapsed={1}
        style={{ backgroundColor: 'transparent', fontFamily: 'var(--font-mono, monospace)' }}
      />
    </div>
  );
}
