'use client';

import { Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { NodeResult, SimulationToolCall } from '../../../types/simulation';
import { TokenDisplay } from './TokenDisplay';

function formatJson(value: unknown): string {
  if (value === undefined || value === null) return '';
  return JSON.stringify(value, null, 2);
}

function ToolCallCard({ call }: { call: SimulationToolCall }) {
  return (
    <div className="w-fit rounded-md border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-900 dark:bg-orange-950/30">
      <div className="flex items-center gap-1.5">
        <Wrench className="size-3 text-orange-600" />
        <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">{call.toolName}</span>
      </div>
      {call.input !== undefined && call.input !== null && (
        <pre className="mt-1 max-h-32 overflow-auto rounded bg-background p-1.5 font-mono text-[10px]">
          {formatJson(call.input)}
        </pre>
      )}
    </div>
  );
}

function AgentText({ text }: { text: string }) {
  if (text === '') return null;
  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] rounded-lg bg-muted px-3 py-1.5 text-sm">{text}</div>
    </div>
  );
}

export function NodeResultItem({ result }: { result: NodeResult }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px]">{result.nodeId}</Badge>
        <TokenDisplay tokens={result.tokens} />
      </div>
      {result.toolCalls.map((call, i) => (
        <ToolCallCard key={i} call={call} />
      ))}
      <AgentText text={result.text} />
    </div>
  );
}
