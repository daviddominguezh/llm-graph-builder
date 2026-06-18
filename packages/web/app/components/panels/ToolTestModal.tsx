'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCallback, useRef, useState } from 'react';

import type { ToolCallResponse } from '../../lib/api';
import { ToolTestForm } from './ToolTestForm';
import { ToolTestResult } from './ToolTestResult';

export type RunTool = (
  toolName: string,
  args: Record<string, unknown>,
  signal: AbortSignal
) => Promise<ToolCallResponse>;

interface ToolTestModalProps {
  tool: { name: string; description?: string; inputSchema?: Record<string, unknown> } | null;
  runTool: RunTool | null;
  onClose: () => void;
}

type ResultState = 'empty' | 'loading' | 'done';

function ModalBody({ tool, runTool }: { tool: NonNullable<ToolTestModalProps['tool']>; runTool: RunTool | null }) {
  const [resultState, setResultState] = useState<ResultState>('empty');
  const [result, setResult] = useState<ToolCallResponse | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleRun = useCallback(
    async (args: Record<string, unknown>) => {
      if (runTool === null) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const start = Date.now();
      setResultState('loading');
      setStartedAt(start);
      setDurationMs(null);
      await dispatchRun({ runTool, toolName: tool.name, args, controller, start, setDurationMs, setResult, setResultState });
    },
    [runTool, tool.name]
  );

  const schema = tool.inputSchema as
    | { properties?: Record<string, { type?: string; description?: string; enum?: string[] }>; required?: string[] }
    | undefined;

  return (
    <div className="grid h-full min-h-0 grid-cols-[45fr_55fr]">
      <ToolTestForm schema={schema} running={resultState === 'loading'} onRun={handleRun} />
      <div className="flex min-w-0 min-h-0">
        <Separator orientation="vertical" />
        <div className="flex min-w-0 min-h-0 flex-1 flex-col">
          <ToolTestResult state={resultState} result={result} startedAt={startedAt} durationMs={durationMs} />
        </div>
      </div>
    </div>
  );
}

interface DispatchArgs {
  runTool: RunTool;
  toolName: string;
  args: Record<string, unknown>;
  controller: AbortController;
  start: number;
  setDurationMs: (n: number | null) => void;
  setResult: (r: ToolCallResponse | null) => void;
  setResultState: (s: ResultState) => void;
}

async function dispatchRun(d: DispatchArgs): Promise<void> {
  try {
    const res = await d.runTool(d.toolName, d.args, d.controller.signal);
    if (d.controller.signal.aborted) return;
    d.setDurationMs(Date.now() - d.start);
    d.setResult(res);
    d.setResultState('done');
  } catch (err: unknown) {
    if (d.controller.signal.aborted) return;
    d.setDurationMs(Date.now() - d.start);
    const message = err instanceof Error ? err.message : 'Unknown error';
    d.setResult({ success: false, error: { message } });
    d.setResultState('done');
  }
}

function ModalHeaderTitle({ name, description }: { name: string; description?: string }) {
  return (
    <DialogHeader className="border-b pl-5 py-3 pr-7">
      <Tooltip>
        <TooltipTrigger render={<DialogTitle className="cursor-default max-w-[70%] truncate font-mono text-sm font-semibold tracking-tight" />}>
          {name}
        </TooltipTrigger>
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>
      {description !== undefined && (
        <Tooltip>
          <TooltipTrigger render={<DialogDescription className="cursor-default w-fit line-clamp-1" />}>
            {description}
          </TooltipTrigger>
          <TooltipContent>{description}</TooltipContent>
        </Tooltip>
      )}
    </DialogHeader>
  );
}

export function ToolTestModal({ tool, runTool, onClose }: ToolTestModalProps) {
  const open = tool !== null;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="sm:max-w-5xl h-[min(70vh,640px)] flex flex-col gap-0 p-0"
        showCloseButton
      >
        {tool !== null && (
          <>
            <ModalHeaderTitle name={tool.name} description={tool.description} />
            <div className="flex-1 min-h-0">
              <ModalBody tool={tool} runTool={runTool} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
