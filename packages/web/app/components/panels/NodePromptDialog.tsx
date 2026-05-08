'use client';

import '@/app/styles/starry-night.css';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OutputSchemaEntity } from '@daviddh/graph-types';
import { useEdges } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import { Check, Copy, Loader2, SquareTerminal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { MarkdownHooks } from 'react-markdown';
import rehypeStarryNight from 'rehype-starry-night';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import type { Agent } from '../../schemas/graph.schema';
import type { ContextPreset } from '../../types/preset';
import { buildPromptForNode } from '../../utils/buildPromptForNode';
import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';

interface NodePromptDialogProps {
  nodeId: string;
  allNodes: Array<Node<RFNodeData>>;
  agents: Agent[];
  presets: ContextPreset[];
  activePresetId: string;
  onSetActivePreset: (id: string) => void;
  outputSchemas: OutputSchemaEntity[];
}

interface PromptState {
  text: string;
  loading: boolean;
  error: string | null;
}

const COPY_FEEDBACK_DURATION = 1500;

function PromptLoading() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function CopyPromptButton({ text }: { text: string }) {
  const t = useTranslations('common');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, COPY_FEEDBACK_DURATION);
  }, [text]);

  const Icon = copied ? Check : Copy;
  const label = copied ? t('copied') : t('copyPrompt');

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="absolute right-1 top-1 z-10 text-muted-foreground hover:text-foreground rounded-full"
      onClick={handleCopy}
      aria-label={label}
      title={label}
    >
      <Icon />
    </Button>
  );
}

function PromptContent({ state }: { state: PromptState }) {
  if (state.loading) return <PromptLoading />;

  if (state.error) {
    return <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">{state.error}</div>;
  }

  return (
    <div className="relative flex flex-1 min-h-0">
      <CopyPromptButton text={state.text} />
      <div className="w-full overflow-y-auto min-h-0 flex-1">
        <div className="w-full markdown-content h-full rounded-md p-3 text-xs bg-input/70">
          <MarkdownHooks remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeStarryNight]}>
            {state.text}
          </MarkdownHooks>
        </div>
      </div>
    </div>
  );
}

function PresetSelector({
  presets,
  activePresetId,
  onSetActivePreset,
}: Pick<NodePromptDialogProps, 'presets' | 'activePresetId' | 'onSetActivePreset'>) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs shrink-0">Preset</Label>
      <Select
        value={activePresetId}
        onValueChange={(v) => {
          if (v) onSetActivePreset(v);
        }}
        items={presets.map((p) => ({ value: p.id, label: p.name }))}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent side="bottom" align="end" alignItemWithTrigger={false} className="w-auto min-w-(--anchor-width)">
          {presets.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function NodePromptDialog({
  nodeId,
  allNodes,
  agents,
  presets,
  activePresetId,
  onSetActivePreset,
  outputSchemas,
}: NodePromptDialogProps) {
  const edges = useEdges<Edge<RFEdgeData>>();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<PromptState>({ text: '', loading: false, error: null });
  const [, startTransition] = useTransition();

  const activePreset = presets.find((p) => p.id === activePresetId);

  useEffect(() => {
    if (!open || !activePreset) return;

    let cancelled = false;
    startTransition(() => {
      setPrompt({ text: '', loading: true, error: null });
    });

    buildPromptForNode({ nodes: allNodes, edges, nodeId, preset: activePreset, agents, outputSchemas })
      .then((text) => {
        if (!cancelled) setPrompt({ text, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to generate prompt';
        setPrompt({ text: '', loading: false, error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [open, nodeId, activePreset, agents, allNodes, edges, outputSchemas, startTransition]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button className="text-muted-foreground" variant="ghost" size="icon" title="View prompt">
            <SquareTerminal />
          </Button>
        }
      />
      <AlertDialogContent size="lg" className="h-[85vh] flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Prompt: <span className="font-mono font-normal">{nodeId}</span>
          </AlertDialogTitle>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <PresetSelector
            presets={presets}
            activePresetId={activePresetId}
            onSetActivePreset={onSetActivePreset}
          />
          <PromptContent state={prompt} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
