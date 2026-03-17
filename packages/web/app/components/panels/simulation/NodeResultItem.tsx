'use client';

import { AlertTriangle, Braces, Brain, ChevronRight, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { NodeResult, SimulationToolCall } from '../../../types/simulation';
import { TokenDisplay } from './TokenDisplay';

function formatJson(value: unknown): string {
  if (value === undefined || value === null) return '';
  return JSON.stringify(value, null, 2);
}

function ToolCallRow({ call }: { call: SimulationToolCall }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('simulation');
  const hasContent = call.input !== undefined || call.output !== undefined;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-left"
        disabled={!hasContent}
      >
        <ChevronRight
          className={`size-3 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''} ${hasContent ? '' : 'invisible'}`}
        />
        <Wrench className="size-3 text-muted-foreground" />
        <span className="font-mono text-[11px]">{call.toolName}</span>
      </button>
      {open && <ToolCallDetails call={call} inputLabel={t('toolInput')} outputLabel={t('toolOutput')} />}
    </div>
  );
}

function ToolCallDetails({
  call,
  inputLabel,
  outputLabel,
}: {
  call: SimulationToolCall;
  inputLabel: string;
  outputLabel: string;
}) {
  const hasInput = call.input !== undefined && call.input !== null;
  const hasOutput = call.output !== undefined && call.output !== null;

  return (
    <div className="ml-[30px] mt-1 flex flex-col gap-1">
      {hasInput && (
        <pre className="max-h-28 overflow-auto rounded bg-muted p-1.5 font-mono text-[10px]">
          <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">{inputLabel}</span>
          {formatJson(call.input)}
        </pre>
      )}
      {hasOutput && (
        <pre className="max-h-28 overflow-auto rounded bg-muted p-1.5 font-mono text-[10px]">
          <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">{outputLabel}</span>
          {formatJson(call.output)}
        </pre>
      )}
    </div>
  );
}

function ReasoningRow({ reasoning }: { reasoning: string }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('simulation');

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-left"
      >
        <ChevronRight
          className={`size-3 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Brain className="size-3 text-muted-foreground" />
        <span className="font-mono text-[11px]">{t('reasoning')}</span>
      </button>
      {open && (
        <pre className="ml-[30px] mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-1.5 font-mono text-[10px]">
          {reasoning}
        </pre>
      )}
    </div>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-1.5 text-destructive">
      <AlertTriangle className="size-3" />
      <span className="font-mono text-[11px]">{message}</span>
    </div>
  );
}

function OutputRow({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col">
      <button type="button" onClick={() => setOpen((prev) => !prev)} className="flex items-center gap-1.5 text-left">
        <ChevronRight
          className={`size-3 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Braces className="size-3 text-muted-foreground" />
        <span className="font-mono text-[11px]">Output</span>
      </button>
      {open && (
        <pre className="ml-[30px] mt-1 max-h-48 overflow-auto rounded bg-muted p-1.5 font-mono text-[10px]">
          {formatJson(data)}
        </pre>
      )}
    </div>
  );
}

function AgentText({ text }: { text: string }) {
  if (text === '') return null;
  return <p className="pl-[18px] text-xs leading-relaxed">{text}</p>;
}

export function NodeResultItem({ result }: { result: NodeResult }) {
  const borderClass = result.error !== undefined
    ? 'border-destructive/50'
    : 'border-muted-foreground/30';

  return (
    <div className={`max-w-[80%] flex flex-col gap-0.5 border-l-3 ${borderClass} py-0 pl-2`}>
      <span className="font-mono text-[11px] font-medium">{result.nodeId}</span>
      {result.error !== undefined && <ErrorRow message={result.error} />}
      {result.reasoning !== undefined && <ReasoningRow reasoning={result.reasoning} />}
      {result.toolCalls.map((call, i) => (
        <ToolCallRow key={i} call={call} />
      ))}
      {result.output !== undefined && <OutputRow data={result.output} />}
      <AgentText text={result.text} />
      <TokenDisplay tokens={result.tokens} durationMs={result.durationMs} className="mt-0.5" />
    </div>
  );
}
