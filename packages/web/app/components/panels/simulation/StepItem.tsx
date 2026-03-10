'use client';

import { Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Separator } from '@/components/ui/separator';
import type { NodeTokenUsage, SimulationStep, SimulationToolCall } from '../../../types/simulation';
import { TokenDisplay } from './TokenDisplay';

interface StepItemProps {
  step: SimulationStep;
  index: number;
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

function ToolCallItem({ call }: { call: SimulationToolCall }) {
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

function ToolCallsList({ calls }: { calls: SimulationToolCall[] }) {
  if (calls.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {calls.map((call, i) => (
        <ToolCallItem key={i} call={call} />
      ))}
    </div>
  );
}

function NodeTokenItem({ entry }: { entry: NodeTokenUsage }) {
  return (
    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
      <span className="font-medium">{entry.node}</span>
      <TokenDisplay tokens={entry.tokens} />
    </div>
  );
}

function NodeTokensList({ entries, t }: { entries: NodeTokenUsage[]; t: (key: string) => string }) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-1 flex flex-col gap-0.5 rounded border bg-muted/30 px-2 py-1.5">
      <span className="text-[10px] font-medium text-muted-foreground">{t('nodeTokens')}</span>
      {entries.map((entry, i) => (
        <NodeTokenItem key={i} entry={entry} />
      ))}
    </div>
  );
}

export function StepItem({ step, index }: StepItemProps) {
  const t = useTranslations('simulation');
  return (
    <div className="flex flex-col gap-1.5">
      {index > 0 && <Separator className="my-1" />}
      <UserMessage text={step.userText} />
      <ToolCallsList calls={step.toolCalls} />
      <AgentMessage text={step.agentText} />
      <NodeTokensList entries={step.nodeTokens} t={t} />
      <div className="flex items-center justify-between px-2">
        <span className="text-[10px] font-medium text-muted-foreground">{t('totalTokens')}</span>
        <TokenDisplay tokens={step.tokenUsage} />
      </div>
    </div>
  );
}
