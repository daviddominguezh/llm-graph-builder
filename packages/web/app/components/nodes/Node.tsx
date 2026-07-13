"use client";

import { memo } from "react";
import { type NodeProps, useEdges } from "@xyflow/react";
import { Separator } from "@/components/ui/separator";
import type { RFNodeData, RFEdgeData } from "../../utils/graphTransformers";
import { getNodeKind, isRowModeNodeKind, type NodeKind } from "../../utils/nodeKind";
import { getPreconditionDisplayValue } from "../../utils/preconditionHelpers";
import { NodeHeader } from "./NodeHeader";
import { NodeBody } from "./NodeBody";
import { NodeOptions } from "./NodeOptions";
import { Handles } from "./Handles";
import type { Edge } from "@xyflow/react";
import { AlertCircle, Wrench } from "lucide-react";

function getToolNameForNode(id: string, edges: Edge<RFEdgeData>[]): string | undefined {
  const toolEdge = edges.find(
    (e) => e.source === id && e.data?.preconditions?.[0]?.type === "tool_call"
  );
  const precondition = toolEdge?.data?.preconditions?.[0];
  return precondition === undefined ? undefined : getPreconditionDisplayValue(precondition);
}

interface NodeShellProps {
  id: string;
  nodeData: RFNodeData;
  nodeKind: NodeKind;
  rowMode: boolean;
  options: Edge<RFEdgeData>[];
  toolName?: string;
  selected: boolean;
}

function NodeShell({ id, nodeData, nodeKind, rowMode, options, toolName, selected }: NodeShellProps) {
  const width = nodeData.nodeWidth ?? 180;
  const muted = nodeData.muted ?? false;
  const hasError = nodeData.hasError ?? false;
  const nextNodeIsUser = nodeData.nextNodeIsUser ?? false;

  const borderWidth = hasError || nextNodeIsUser ? "border-[1.5px]" : "border";
  const borderColor = hasError ? "border-destructive" : nextNodeIsUser ? "border-[#22c55e]" : "border-input";
  const hoverBorder = muted ? "" : "hover:border-sky-500";
  const mutedStyle = muted ? "border-border bg-muted dark:bg-muted grayscale dark:contrast-85 pointer-events-none" : "";
  const selectionRing = selected ? "ring-2 ring-primary" : "";

  const containerBaseStyle = "rounded-lg bg-popover relative transition-colors";
  const containerClassname = `${containerBaseStyle} ${borderWidth} ${borderColor} ${hoverBorder} ${mutedStyle} ${selectionRing}`;
  const heightStyle = rowMode
    ? { minHeight: "160px" as const }
    : { minHeight: "220px" as const, maxHeight: "220px" as const };

  return (
    <div className={containerClassname} style={{ width: `${width}px`, ...heightStyle }}>
      {hasError && (
        <div className="absolute -right-2 -top-2 z-10 flex size-5 items-center justify-center rounded-full bg-destructive">
          <AlertCircle className="size-3 text-white" />
        </div>
      )}
      <Handles nodeId={id} nextNodeIsUser={nextNodeIsUser} rowMode={rowMode} />
      <NodeHeader nodeKind={nodeKind} agent={nodeData.agent} nodeId={id} />
      <Separator />
      <NodeBody nodeId={nodeData.nodeId} description={nodeData.description} text={nodeData.text} />
      {toolName !== undefined && (
        <div className="flex items-center gap-1.5 px-3 pb-2 text-xs text-orange-700">
          <Wrench className="h-3 w-3 shrink-0" />
          <span className="line-clamp-1! font-medium">{toolName}</span>
        </div>
      )}
      {rowMode && <NodeOptions nodeId={id} nodeKind={nodeKind} options={options} />}
    </div>
  );
}

function AgentNodeComponent({ data, id, selected }: NodeProps) {
  const nodeData = data as RFNodeData;
  const edges = useEdges<Edge<RFEdgeData>>();

  const nodeKind = getNodeKind(id, edges);
  const rowMode = isRowModeNodeKind(nodeKind);
  const options = rowMode ? edges.filter((e) => e.source === id) : [];
  const toolName = nodeKind === "tool_call" ? getToolNameForNode(id, edges) : undefined;

  return (
    <NodeShell
      id={id}
      nodeData={nodeData}
      nodeKind={nodeKind}
      rowMode={rowMode}
      options={options}
      toolName={toolName}
      selected={selected ?? false}
    />
  );
}

export const AgentNode = memo(AgentNodeComponent);
