'use client';

import type { ExecutionMessageRow } from '@/app/lib/dashboard';
import { Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { extractMessageText } from './agentDebugUtils';

interface ToolCallDisplayProps {
  message: ExecutionMessageRow;
  resultMessages: ExecutionMessageRow[];
}

interface ToolCallEntry {
  id: string;
  name: string;
  arguments: string;
}

function extractFunctionField(tc: Record<string, unknown>, field: string, fallback: string): string {
  if (typeof tc['function'] !== 'object' || tc['function'] === null) return fallback;
  const fn = tc['function'] as Record<string, unknown>;
  return typeof fn[field] === 'string' ? (fn[field] as string) : fallback;
}

function toToolCallEntry(tc: Record<string, unknown>): ToolCallEntry {
  return {
    id: typeof tc['id'] === 'string' ? tc['id'] : '',
    name: extractFunctionField(tc, 'name', 'unknown'),
    arguments: extractFunctionField(tc, 'arguments', '{}'),
  };
}

function parseToolCalls(toolCalls: unknown): ToolCallEntry[] {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls
    .filter((tc): tc is Record<string, unknown> => typeof tc === 'object' && tc !== null)
    .map(toToolCallEntry);
}

function formatArguments(args: string): string {
  try {
    return JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    return args;
  }
}

function findResultForToolCall(resultMessages: ExecutionMessageRow[], toolCallId: string): string | null {
  const match = resultMessages.find((m) => m.tool_call_id === toolCallId);
  if (match === undefined) return null;
  return extractMessageText(match);
}

function ToolCallEntryCard({ entry, result }: { entry: ToolCallEntry; result: string | null }) {
  const t = useTranslations('dashboard.agentDebug');

  return (
    <div className="rounded-md border bg-muted/30 p-2.5 text-xs">
      <div className="flex items-center gap-1.5 font-semibold font-mono">
        <Wrench className="size-3 text-muted-foreground" />
        {entry.name}
      </div>
      <div className="mt-1.5">
        <span className="text-[10px] uppercase text-muted-foreground font-semibold">{t('toolCallArgs')}</span>
        <pre className="mt-0.5 whitespace-pre-wrap break-all text-[11px] text-muted-foreground font-mono">
          {formatArguments(entry.arguments)}
        </pre>
      </div>
      {result !== null && (
        <div className="mt-1.5">
          <span className="text-[10px] uppercase text-muted-foreground font-semibold">
            {t('toolCallResult')}
          </span>
          <pre className="mt-0.5 whitespace-pre-wrap break-all text-[11px] text-muted-foreground font-mono">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}

export function ToolCallDisplay({ message, resultMessages }: ToolCallDisplayProps) {
  const entries = parseToolCalls(message.tool_calls);
  if (entries.length === 0) return null;

  return (
    <div className="ml-8 flex flex-col gap-1.5">
      {entries.map((entry) => (
        <ToolCallEntryCard
          key={entry.id}
          entry={entry}
          result={findResultForToolCall(resultMessages, entry.id)}
        />
      ))}
    </div>
  );
}
