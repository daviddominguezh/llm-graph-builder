'use client';

import { Braces, ChevronRight, Wrench } from 'lucide-react';
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
  const hasInput = call.input !== undefined && call.input !== null;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-left"
        disabled={!hasInput}
      >
        <ChevronRight
          className={`size-3 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''} ${hasInput ? '' : 'invisible'}`}
        />
        <Wrench className="size-3 text-muted-foreground" />
        <span className="font-mono text-[11px]">{call.toolName}</span>
      </button>
      {open && hasInput && (
        <pre className="ml-[30px] mt-1 max-h-28 overflow-auto rounded bg-muted p-1.5 font-mono text-[10px]">
          <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">{t('toolInput')}</span>
          {formatJson(call.input)}
        </pre>
      )}
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
  return (
    <div className="max-w-[80%] flex flex-col gap-0.5 border-l-3 border-muted-foreground/30 py-0 pl-2">
      <span className="font-mono text-[11px] font-medium">{result.nodeId}</span>
      {result.toolCalls.map((call, i) => (
        <ToolCallRow key={i} call={call} />
      ))}
      {result.output !== undefined && <OutputRow data={result.output} />}
      <AgentText text={result.text} />
      <TokenDisplay tokens={result.tokens} durationMs={result.durationMs} className="mt-0.5" />
    </div>
  );
}
