"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { MessageSquare, Brain, Wrench } from "lucide-react";
import type { RFEdgeData } from "../../utils/graphTransformers";

function PreconditionEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeData = data as RFEdgeData | undefined;
  const preconditions = edgeData?.preconditions;
  const hasPreconditions = preconditions && preconditions.length > 0;
  const preconditionType = hasPreconditions ? preconditions[0].type : null;
  const muted = edgeData?.muted ?? false;

  const getTypeIcon = () => {
    switch (preconditionType) {
      case "user_said":
        return <MessageSquare className="h-3 w-3" />;
      case "agent_decision":
        return <Brain className="h-3 w-3" />;
      case "tool_call":
        return <Wrench className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const getTypeColors = () => {
    switch (preconditionType) {
      case "user_said":
        return "bg-green-100 text-green-700 border-green-300";
      case "agent_decision":
        return "bg-purple-100 text-purple-700 border-purple-300";
      case "tool_call":
        return "bg-orange-100 text-orange-700 border-orange-300";
      default:
        return "bg-gray-100 text-gray-700 border-gray-300";
    }
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? "#000000" : "#94a3b8",
          strokeWidth: selected ? 2 : 1.5,
          strokeDasharray: selected ? "none" : "5 5",
          opacity: muted ? 0.4 : 1,
          transition: "opacity 150ms",
          animation: selected ? "none" : "dash-flow 1s linear infinite",
        }}
      />
      {hasPreconditions && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              opacity: muted ? 0.4 : 1,
              transition: "opacity 150ms",
            }}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${getTypeColors()} ${
              selected ? "ring-2 ring-blue-500 ring-offset-1" : ""
            }`}
          >
            {getTypeIcon()}
            <span>{preconditions.length}</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const PreconditionEdge = memo(PreconditionEdgeComponent);
