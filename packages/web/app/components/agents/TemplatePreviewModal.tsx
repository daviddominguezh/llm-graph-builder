'use client';

import { getTemplateSnapshotAction } from '@/app/actions/templates';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Graph, Precondition } from '@/app/schemas/graph.schema';
import { makePrecondition, makeToolCallPrecondition } from '@/app/utils/preconditionHelpers';
import type { TemplateGraphData } from '@daviddh/graph-types';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

import type { GraphBuilderProps } from '../GraphBuilder';

/* ------------------------------------------------------------------ */
/*  Lazy-load GraphBuilder (no SSR, same as EditorClient)              */
/* ------------------------------------------------------------------ */

const GraphBuilder = dynamic<GraphBuilderProps>(
  () => import('@/app/components/GraphBuilder').then((mod) => mod.GraphBuilder),
  { ssr: false }
);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TemplatePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string | null;
  version: number | null;
}

/* ------------------------------------------------------------------ */
/*  Convert TemplateGraphData → Graph                                  */
/* ------------------------------------------------------------------ */

function templateToGraph(data: TemplateGraphData): Graph {
  return {
    startNode: data.startNode,
    nodes: data.nodes.map((n) => ({
      id: n.id,
      text: n.text,
      kind: n.kind as 'agent' | 'agent_decision',
      description: n.description,
      agent: n.agent,
      nextNodeIsUser: n.nextNodeIsUser,
      fallbackNodeId: n.fallbackNodeId,
      global: n.global,
      defaultFallback: n.defaultFallback,
      outputSchemaId: n.outputSchemaId,
      outputPrompt: n.outputPrompt,
      position: n.position,
    })),
    edges: data.edges.map((e) => ({
      from: e.from,
      to: e.to,
      preconditions: e.preconditions?.map((p): Precondition => {
        if (p.type === 'tool_call') {
          // TODO(Task 115): Template schema enrichment — templates don't carry
          // full SelectedTool refs yet (only a value string). Until that is fixed,
          // we default to builtin/calendar. This will be corrected when templates
          // store providerType/providerId alongside toolName.
          return makeToolCallPrecondition({
            tool: { providerType: 'builtin', providerId: 'calendar', toolName: p.value },
            description: p.description,
          });
        }
        return makePrecondition({
          type: p.type as 'user_said' | 'agent_decision',
          value: p.value,
          description: p.description,
        });
      }),
      contextPreconditions: e.contextPreconditions,
    })),
    agents: data.agents,
    mcpServers: undefined,
    outputSchemas: undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Data fetcher (outside React)                                       */
/* ------------------------------------------------------------------ */

async function fetchPreviewGraph(aid: string, ver: number): Promise<Graph | null> {
  const result = await getTemplateSnapshotAction(aid, ver);
  if (result.graphData === null) return null;
  return templateToGraph(result.graphData);
}

/* ------------------------------------------------------------------ */
/*  Loading state                                                      */
/* ------------------------------------------------------------------ */

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <span className="text-sm text-muted-foreground">{message}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function TemplatePreviewModal({ open, onOpenChange, agentId, version }: TemplatePreviewModalProps) {
  const t = useTranslations('marketplace');
  const tCommon = useTranslations('common');
  const [graph, setGraph] = useState<Graph | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const mountedRef = useRef(true);

  const requestKey = open && agentId && version !== null ? `${agentId}:${String(version)}` : '';

  useEffect(() => {
    mountedRef.current = true;
    if (requestKey === '') return;
    void fetchPreviewGraph(agentId!, version!).then((data) => {
      if (mountedRef.current) {
        setGraph(data);
        setLoadedKey(requestKey);
      }
    });
    return () => {
      mountedRef.current = false;
    };
  }, [requestKey, agentId, version]);

  const isLoaded = requestKey !== '' && loadedKey === requestKey;
  const loading = requestKey !== '' && !isLoaded;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-[1100px] min-w-[1100px] h-[670px] min-h-[670px] flex-col p-0 gap-0!">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle>{t('previewTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-1 min-h-0 w-full">
          {loading && <LoadingState message={tCommon('loading')} />}
          {!loading && isLoaded && graph !== null && (
            <GraphBuilder readOnly graphOverride={graph} />
          )}
          {!loading && isLoaded && graph === null && (
            <LoadingState message={t('previewError')} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
