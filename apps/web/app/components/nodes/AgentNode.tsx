"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, User } from "lucide-react";
import type { RFNodeData } from "../../utils/graphTransformers";

function AgentNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as RFNodeData;

  return (
    <div
      className={`min-w-[180px] max-w-[240px] rounded-lg border-2 border-blue-500 bg-blue-50 p-3 ${
        selected ? "ring-2 ring-blue-600 ring-offset-2" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !bg-blue-500"
      />

      <div className="mb-1 flex items-center gap-2">
        <Bot className="h-4 w-4 text-blue-600" />
        <span className="text-xs font-medium text-blue-600">
          {nodeData.agent ?? "Agent"}
        </span>
        {nodeData.nextNodeIsUser && (
          <User className="ml-auto h-3 w-3 text-blue-400" />
        )}
      </div>

      <p className="line-clamp-2 text-sm text-gray-800">{nodeData.text}</p>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !bg-blue-500"
      />
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
