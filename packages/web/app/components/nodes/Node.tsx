'use client';

import { Separator } from '@/components/ui/separator';
import { type NodeProps, useEdges, useStore } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useMemo } from 'react';

import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import { type NodeKind, getNodeKind, isRowModeNodeKind } from '../../utils/nodeKind';
import { Handles } from './Handles';
import { NodeBody } from './NodeBody';
import { NodeHeader } from './NodeHeader';
import { NodeOptions } from './NodeOptions';
import { NodeToolInfo, type ToolRef } from './NodeToolInfo';

interface ToolInfo {
  toolRef: ToolRef;
  fallbackDescription?: string;
}

function getToolInfoForNode(id: string, edges: Edge<RFEdgeData>[]): ToolInfo | undefined {
  const toolEdge = edges.find((e) => e.source === id && e.data?.preconditions?.[0]?.type === 'tool_call');
  const precondition = toolEdge?.data?.preconditions?.[0];
  if (precondition === undefined || precondition.type !== 'tool_call') return undefined;
  return { toolRef: precondition.tool, fallbackDescription: precondition.description };
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sortOptionsByTargetY(options: Edge<RFEdgeData>[], ys: number[]): Edge<RFEdgeData>[] {
  return options
    .map((edge, i) => ({ edge, y: ys[i] ?? 0 }))
    .sort((a, b) => a.y - b.y)
    .map((entry) => entry.edge);
}

// Order the option rows by their target node's vertical position so the edges
// leaving each row don't cross. Subscribes narrowly (only re-sorts when a target
// node's Y actually changes) to avoid re-rendering every node on each drag frame.
function useSortedOptions(id: string, rowMode: boolean, edges: Edge<RFEdgeData>[]): Edge<RFEdgeData>[] {
  const options = useMemo(() => (rowMode ? edges.filter((e) => e.source === id) : []), [rowMode, edges, id]);
  const targetIds = useMemo(() => options.map((e) => e.target), [options]);
  const targetYs = useStore(
    (s) => targetIds.map((tid) => s.nodeLookup.get(tid)?.internals.positionAbsolute.y ?? 0),
    arraysEqual
  );
  return useMemo(() => sortOptionsByTargetY(options, targetYs), [options, targetYs]);
}

interface NodeShellProps {
  id: string;
  nodeData: RFNodeData;
  nodeKind: NodeKind;
  rowMode: boolean;
  options: Edge<RFEdgeData>[];
  toolInfo?: ToolInfo;
  selected: boolean;
}

function NodeShell({ id, nodeData, nodeKind, rowMode, options, toolInfo, selected }: NodeShellProps) {
  const t = useTranslations('nodePanel');
  const width = nodeData.nodeWidth ?? 180;
  const muted = nodeData.muted ?? false;
  const hasError = nodeData.hasError ?? false;
  const nextNodeIsUser = nodeData.nextNodeIsUser ?? false;

  const borderWidth = hasError ? 'ring-[1.5px]' : 'ring';
  const borderColor = hasError ? 'border-destructive' : 'ring-input';
  const hoverBorder = muted ? '' : 'hover:ring-sky-500';
  const mutedStyle = muted
    ? 'ring-border bg-muted dark:bg-muted grayscale dark:contrast-85 pointer-events-none'
    : '';
  const selectionRing = selected ? 'ring-2! ring-primary!' : '';

  const containerBaseStyle = 'flex flex-col rounded-lg bg-popover relative transition-colors';
  const containerClassname = `${containerBaseStyle} ${borderWidth} ${borderColor} ${hoverBorder} ${mutedStyle} ${selectionRing}`;

  return (
    <div className={containerClassname} style={{ width: `${width}px` }}>
      {nextNodeIsUser && (
        <div className="w-full flex justify-center absolute h-[30px] -top-[20px] -z-[1]">
          <div className="flex items-center justify-center w-full h-full bg-[#22c55e] rounded-ss-lg rounded-se-lg text-white font-semibold font-mono text-[10px] uppercase">
            <div className="mb-[10px]">{t('inputNode')}</div>
          </div>
        </div>
      )}
      {hasError && (
        <div className="shrink-0 absolute -right-2 -top-2 z-10 flex size-5 items-center justify-center rounded-full bg-destructive">
          <AlertCircle className="size-3 text-white" />
        </div>
      )}
      <Handles nodeId={id} rowMode={rowMode} />
      <NodeHeader nodeKind={nodeKind} agent={nodeData.agent} nodeId={id} />
      <Separator />
      {toolInfo !== undefined && (
        <NodeToolInfo toolRef={toolInfo.toolRef} fallbackDescription={toolInfo.fallbackDescription} />
      )}
      {toolInfo === undefined && (
        <NodeBody nodeId={nodeData.nodeId} description={nodeData.description} text={nodeData.text} />
      )}
      {rowMode && (
        <NodeOptions
          hasBody={!!(nodeData.description || nodeData.text)}
          nodeId={id}
          nodeKind={nodeKind}
          options={options}
        />
      )}
    </div>
  );
}

function AgentNodeComponent({ data, id, selected }: NodeProps) {
  const nodeData = data as RFNodeData;
  const edges = useEdges<Edge<RFEdgeData>>();

  const nodeKind = getNodeKind(id, edges);
  const rowMode = isRowModeNodeKind(nodeKind);
  const options = useSortedOptions(id, rowMode, edges);
  const toolInfo = nodeKind === 'tool_call' ? getToolInfoForNode(id, edges) : undefined;

  return (
    <NodeShell
      id={id}
      nodeData={nodeData}
      nodeKind={nodeKind}
      rowMode={rowMode}
      options={options}
      toolInfo={toolInfo}
      selected={selected ?? false}
    />
  );
}

export const AgentNode = memo(AgentNodeComponent);
