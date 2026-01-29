"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { RFNodeData } from "../../utils/graphTransformers";

function AgentDecisionNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as RFNodeData;

  return (
    <div
      className={`min-w-[180px] max-w-[240px] rounded-lg border border-dashed bg-white ${
        selected ? "border-primary" : "border-secondary"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          borderColor: selected ? "var(--primary)" : "var(--secondary)",
          backgroundColor: "white",
          width: "10px",
          height: "10px",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          borderColor: selected ? "var(--primary)" : "var(--secondary)",
          backgroundColor: "white",
          width: "10px",
          height: "10px",
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <GitBranch className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium uppercase text-muted-foreground">Decision Node</span>
        {nodeData.agent && (
          <Badge variant="outline" className="ml-auto border-secondary bg-white uppercase">
            {nodeData.agent}
          </Badge>
        )}
      </div>

      <Separator />

      {/* Body */}
      <div className="px-3 py-2">
        <p className="text-sm font-medium text-foreground">{nodeData.nodeId}</p>
        {nodeData.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {nodeData.description}
          </p>
        )}
      </div>
    </div>
  );
}

export const AgentDecisionNode = memo(AgentDecisionNodeComponent);
