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

import type { McpTransport } from '../../schemas/graph.schema';
import type { ToolCallOptions, ToolCallResponse } from '../../lib/api';
import { callMcpTool } from '../../lib/api';
import { ToolTestForm } from './ToolTestForm';
import { ToolTestResult } from './ToolTestResult';

interface ToolTestModalProps {
  tool: { name: string; description?: string; inputSchema?: Record<string, unknown> } | null;
  transport: McpTransport | null;
  callOptions?: ToolCallOptions;
  onClose: () => void;
}

type ResultState = 'empty' | 'loading' | 'done';

function ModalBody({
  tool,
  transport,
  callOptions,
}: Pick<ToolTestModalProps, 'tool' | 'transport' | 'callOptions'>) {
  const [resultState, setResultState] = useState<ResultState>('empty');
  const [result, setResult] = useState<ToolCallResponse | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleRun = useCallback(
    async (args: Record<string, unknown>) => {
      if (transport === null || tool === null) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setResultState('loading');
      setStartedAt(Date.now());
      try {
        const res = await callMcpTool(transport, tool.name, args, callOptions, controller.signal);
        if (!controller.signal.aborted) {
          setResult(res);
          setResultState('done');
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Unknown error';
        setResult({ success: false, error: { message } });
        setResultState('done');
      }
    },
    [transport, tool, callOptions]
  );

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setResultState('empty');
    setStartedAt(null);
  }, []);

  const schema = tool?.inputSchema as
    | { properties?: Record<string, { type?: string; description?: string; enum?: string[] }>; required?: string[] }
    | undefined;

  return (
    <div className="grid h-full grid-cols-[45fr_55fr]">
      <ToolTestForm
        schema={schema}
        running={resultState === 'loading'}
        onRun={handleRun}
        onCancel={handleCancel}
      />
      <div className="flex">
        <Separator orientation="vertical" />
        <div className="flex flex-1 flex-col overflow-y-auto scroll-py-4">
          <ToolTestResult state={resultState} result={result} startedAt={startedAt} />
        </div>
      </div>
    </div>
  );
}

export function ToolTestModal({ tool, transport, callOptions, onClose }: ToolTestModalProps) {
  const open = tool !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="sm:max-w-5xl h-[min(70vh,640px)] flex flex-col gap-0 p-0"
        showCloseButton
      >
        {tool !== null && (
          <>
            <DialogHeader className="border-b px-5 py-3">
              <Tooltip>
                <TooltipTrigger render={<DialogTitle className="max-w-[70%] truncate font-mono text-sm font-semibold tracking-tight" />}>
                  {tool.name}
                </TooltipTrigger>
                <TooltipContent>{tool.name}</TooltipContent>
              </Tooltip>
              {tool.description !== undefined && (
                <Tooltip>
                  <TooltipTrigger
                    render={<DialogDescription className="line-clamp-1" />}
                  >
                    {tool.description}
                  </TooltipTrigger>
                  <TooltipContent>{tool.description}</TooltipContent>
                </Tooltip>
              )}
            </DialogHeader>
            <div className="flex-1 min-h-0">
              <ModalBody tool={tool} transport={transport} callOptions={callOptions} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
