"use client";

import { useEffect, useState } from "react";
import { Loader2, SquareTerminal } from "lucide-react";
import { useNodes, useEdges } from "@xyflow/react";
import { MarkdownHooks } from "react-markdown";
import rehypeStarryNight from "rehype-starry-night";
import remarkGfm from "remark-gfm";
import "@wooorm/starry-night/style/both";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { RFNodeData, RFEdgeData } from "../../utils/graphTransformers";
import type { Node, Edge } from "@xyflow/react";
import type { Agent } from "../../schemas/graph.schema";
import type { ContextPreset } from "../../types/preset";
import { buildPromptForNode } from "../../utils/buildPromptForNode";

interface NodePromptDialogProps {
  nodeId: string;
  agents: Agent[];
  presets: ContextPreset[];
  activePresetId: string;
  onSetActivePreset: (id: string) => void;
}

interface PromptState {
  text: string;
  loading: boolean;
  error: string | null;
}

function PromptLoading() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function PromptContent({ state }: { state: PromptState }) {
  if (state.loading) return <PromptLoading />;

  if (state.error) {
    return (
      <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
        {state.error}
      </div>
    );
  }

  return (
    <Tabs defaultValue="markdown" className="flex flex-1 flex-col min-h-0">
      <TabsList className="w-fit">
        <TabsTrigger value="markdown">Markdown</TabsTrigger>
        <TabsTrigger value="plain">Plain text</TabsTrigger>
      </TabsList>
      <TabsContent value="markdown" className="flex-1 min-h-0 overflow-y-auto rounded-md border p-3 text-xs">
        <div className="markdown-content">
          <MarkdownHooks remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeStarryNight]}>
            {state.text}
          </MarkdownHooks>
        </div>
      </TabsContent>
      <TabsContent value="plain" className="flex-1 min-h-0 overflow-y-auto rounded-md border p-3 text-xs font-mono whitespace-pre-wrap">
        {state.text}
      </TabsContent>
    </Tabs>
  );
}

function PresetSelector({
  presets,
  activePresetId,
  onSetActivePreset,
}: Pick<NodePromptDialogProps, "presets" | "activePresetId" | "onSetActivePreset">) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs shrink-0">Preset</Label>
      <Select value={activePresetId} onValueChange={(v) => { if (v) onSetActivePreset(v); }}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
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
  agents,
  presets,
  activePresetId,
  onSetActivePreset,
}: NodePromptDialogProps) {
  const nodes = useNodes<Node<RFNodeData>>();
  const edges = useEdges<Edge<RFEdgeData>>();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<PromptState>({ text: "", loading: false, error: null });

  const activePreset = presets.find((p) => p.id === activePresetId);

  useEffect(() => {
    if (!open || !activePreset) return;

    let cancelled = false;
    setPrompt({ text: "", loading: true, error: null });

    buildPromptForNode({ nodes, edges, nodeId, preset: activePreset, agents })
      .then((text) => {
        if (!cancelled) setPrompt({ text, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to generate prompt";
        setPrompt({ text: "", loading: false, error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [open, nodeId, activePreset, agents, nodes, edges]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button className="text-muted-foreground" variant="ghost" size="icon" title="View prompt">
            <SquareTerminal />
          </Button>
        }
      />
      <AlertDialogContent size="lg" className="max-h-[85vh] flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle>Prompt: {nodeId}</AlertDialogTitle>
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
