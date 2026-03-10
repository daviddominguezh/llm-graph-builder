'use client';

import { Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Separator } from '@/components/ui/separator';
import type { SimulationStep, SimulationToolCall } from '../../../types/simulation';
import { TokenDisplay } from './TokenDisplay';

interface StepItemProps {
  step: SimulationStep;
  index: number;
}

function VisitedNodesPath({ nodes }: { nodes: string[] }) {
  return (
    <p className="mb-1 text-xs font-medium text-muted-foreground">{nodes.join(' \u2192 ')}</p>
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground">
        {text}
      </div>
    </div>
  );
}

function AgentMessage({ text }: { text: string }) {
  if (text === '') return null;
  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] rounded-lg bg-muted px-3 py-1.5 text-sm">{text}</div>
    </div>
  );
}

function formatJson(value: unknown): string {
  if (value === undefined || value === null) return '';
  return JSON.stringify(value, null, 2);
}

function ToolCallItem({ call, t }: { call: SimulationToolCall; t: (key: string) => string }) {
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

function ToolCallsList({ calls, t }: { calls: SimulationToolCall[]; t: (key: string) => string }) {
  if (calls.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {calls.map((call, i) => (
        <ToolCallItem key={i} call={call} t={t} />
      ))}
    </div>
  );
}

export function StepItem({ step, index }: StepItemProps) {
  const t = useTranslations('simulation');
  return (
    <div className="flex flex-col gap-1.5">
      {index > 0 && <Separator className="my-1" />}
      <VisitedNodesPath nodes={step.visitedNodes} />
      <UserMessage text={step.userText} />
      <ToolCallsList calls={step.toolCalls} t={t} />
      <AgentMessage text={step.agentText} />
      <TokenDisplay
        tokens={{ input: step.tokenUsage.input, output: step.tokenUsage.output, cached: step.tokenUsage.cached }}
        className="self-end"
      />
    </div>
  );
}
