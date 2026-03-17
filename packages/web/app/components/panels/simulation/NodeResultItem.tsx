'use client';

import { AlertTriangle, Braces, Brain, ChevronRight, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MarkdownHooks } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';

import type { NodeResult, SimulationToolCall } from '../../../types/simulation';
import { SmallJsonBlock, extractMcpPayload, isJsonObject } from '../JsonDisplay';
import { TokenDisplay } from './TokenDisplay';

function hasReasoning(reasoning: string | undefined): reasoning is string {
  return reasoning !== undefined && reasoning !== '';
}

function JsonOrText({ value, label }: { value: unknown; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase text-muted-foreground">{label}</span>
      {isJsonObject(value) ? (
        <SmallJsonBlock value={value} />
      ) : (
        <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded bg-muted p-1.5 font-mono text-[10px]">
          {String(value ?? '')}
        </pre>
      )}
    </div>
  );
}

function ToolCallDetails({ call }: { call: SimulationToolCall }) {
  const t = useTranslations('simulation');
  const hasInput = call.input !== undefined && call.input !== null;
  const extracted = extractMcpPayload(call.output);
  const hasOutput = extracted !== undefined && extracted !== null;

  return (
    <div className="ml-[30px] mt-1 flex flex-col gap-1">
      {hasInput && <JsonOrText value={call.input} label={t('toolInput')} />}
      {hasOutput && <JsonOrText value={extracted} label={t('toolOutput')} />}
    </div>
  );
}

function ToolCallRow({ call }: { call: SimulationToolCall }) {
  const [open, setOpen] = useState(false);
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
      {open && <ToolCallDetails call={call} />}
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
  const extracted = extractMcpPayload(data);

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
        <div className="ml-[30px] mt-1">
          {isJsonObject(extracted) ? (
            <SmallJsonBlock value={extracted} />
          ) : (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-1.5 font-mono text-[10px]">
              {String(extracted ?? '')}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function AgentText({ text }: { text: string }) {
  if (text === '') return null;
  return (
    <div className="markdown-content pl-[18px] text-xs leading-relaxed bg-gray-100/60 rounded-md py-3 pr-3">
      <MarkdownHooks remarkPlugins={[remarkGfm]}>{text}</MarkdownHooks>
    </div>
  );
}

export function NodeResultItem({ result }: { result: NodeResult }) {
  const borderClass = result.error !== undefined
    ? 'border-destructive/50'
    : 'border-muted-foreground/30';

  return (
    <div className={`max-w-[100%] flex flex-col gap-0.5 border-l-3 ${borderClass} py-0 pl-2`}>
      <span className="font-mono text-[11px] font-medium">{result.nodeId}</span>
      {result.error !== undefined && <ErrorRow message={result.error} />}
      {hasReasoning(result.reasoning) && <ReasoningRow reasoning={result.reasoning} />}
      {result.toolCalls.map((call, i) => (
        <ToolCallRow key={i} call={call} />
      ))}
      {result.output !== undefined && <OutputRow data={result.output} />}
      <AgentText text={result.text} />
      <TokenDisplay tokens={result.tokens} durationMs={result.durationMs} className="mt-0.5" />
    </div>
  );
}
