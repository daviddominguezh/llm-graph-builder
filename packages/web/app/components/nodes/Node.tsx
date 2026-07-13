"use client";

import { memo } from "react";
import { type NodeProps, useEdges } from "@xyflow/react";
import { Separator } from "@/components/ui/separator";
import type { RFNodeData, RFEdgeData } from "../../utils/graphTransformers";
import { getNodeKind, isRowModeNodeKind, type NodeKind } from "../../utils/nodeKind";
import { NodeHeader } from "./NodeHeader";
import { NodeBody } from "./NodeBody";
import { NodeOptions } from "./NodeOptions";
import { Handles } from "./Handles";
import type { Edge } from "@xyflow/react";
import { AlertCircle } from "lucide-react";

interface NodeShellProps {
  id: string;
  nodeData: RFNodeData;
  nodeKind: NodeKind;
  rowMode: boolean;
  options: Edge<RFEdgeData>[];
  selected: boolean;
}

function NodeShell({ id, nodeData, nodeKind, rowMode, options, selected }: NodeShellProps) {
  const width = nodeData.nodeWidth ?? 180;
  const muted = nodeData.muted ?? false;
  const hasError = nodeData.hasError ?? false;
  const nextNodeIsUser = nodeData.nextNodeIsUser ?? false;

  const borderWidth = hasError || nextNodeIsUser ? "border-[1.5px]" : "border";
  const borderColor = hasError ? "border-destructive" : nextNodeIsUser ? "border-primary" : "border-input";
  const mutedStyle = muted ? "border-border bg-muted dark:bg-muted grayscale dark:contrast-85 pointer-events-none" : "";
  const selectionRing = selected ? "ring-2 ring-primary" : "";

  const containerBaseStyle = "rounded-lg bg-background p-1 relative";
  const containerClassname = `${containerBaseStyle} ${borderWidth} ${borderColor} ${mutedStyle} ${selectionRing}`;
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

  return (
    <NodeShell
      id={id}
      nodeData={nodeData}
      nodeKind={nodeKind}
      rowMode={rowMode}
      options={options}
      selected={selected ?? false}
    />
  );
}

export const AgentNode = memo(AgentNodeComponent);
