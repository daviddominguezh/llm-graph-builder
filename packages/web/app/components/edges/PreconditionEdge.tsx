"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { MessageSquare, Brain, Wrench } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import type { RFEdgeData } from "../../utils/graphTransformers";
import { getPreconditionDisplayValue } from "../../utils/preconditionHelpers";

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
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8, // Rounded corners on the right angles
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
    if (muted) return "bg-muted text-muted-foreground/50 border-border";
    switch (preconditionType) {
      case "user_said":
        return "bg-green-100 text-[#22c55e] border-[#22c55e] dark:bg-[#22c55e] dark:text-white";
      case "agent_decision":
        return "bg-purple-100 text-[#a855f7] border-[#a855f7] dark:bg-[#a855f7] dark:text-white";
      case "tool_call":
        return "bg-orange-100 text-[#f97316] border-[#f97316] dark:bg-[#f97316] dark:text-white";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const getStrokeColor = () => {
    if (selected) return "var(--foreground)";
    if (muted) return "var(--border)";
    switch (preconditionType) {
      case "user_said":
        return "#22c55e"; // green-500
      case "agent_decision":
        return "#a855f7"; // purple-500
      case "tool_call":
        return "#f97316"; // orange-500
      default:
        return "#94a3b8"; // slate-400
    }
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: getStrokeColor(),
          strokeWidth: selected ? 2 : 1.5,
          strokeDasharray: selected ? "none" : "5 5",
          animation: selected ? "none" : "dash-flow 1s linear infinite",
          pointerEvents: muted ? "none" : "auto",
        }}
      />
      {hasPreconditions && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: muted ? "none" : "all",
            }}
          >
            <Tooltip>
              <TooltipTrigger
                className={`flex items-center gap-1 rounded border p-1.5 text-xs ${getTypeColors()} ${
                  selected ? "ring-2 ring-blue-500 ring-offset-1" : ""
                }`}
              >
                {getTypeIcon()}
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm">
                <div className="space-y-1">
                  {preconditions.map((p, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-medium capitalize">{p.type.replace("_", " ")}:</span>{" "}
                      {getPreconditionDisplayValue(p)}
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const PreconditionEdge = memo(PreconditionEdgeComponent);
