"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch, User } from "lucide-react";
import type { RFNodeData } from "../../utils/graphTransformers";

function AgentDecisionNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as RFNodeData;

  return (
    <div
      className={`min-w-[180px] max-w-[240px] rounded-lg border-2 border-dashed border-amber-500 bg-amber-50 p-3 ${
        selected ? "ring-2 ring-amber-600 ring-offset-2" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !bg-amber-500"
      />

      <div className="mb-1 flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-amber-600" />
        <span className="text-xs font-medium text-amber-600">
          {nodeData.agent ?? "Decision"}
        </span>
        {nodeData.nextNodeIsUser && (
          <User className="ml-auto h-3 w-3 text-amber-400" />
        )}
      </div>

      <p className="line-clamp-2 text-sm text-gray-800">{nodeData.text}</p>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !bg-amber-500"
      />
    </div>
  );
}

export const AgentDecisionNode = memo(AgentDecisionNodeComponent);
