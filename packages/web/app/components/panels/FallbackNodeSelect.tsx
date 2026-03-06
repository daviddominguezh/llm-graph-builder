"use client";

import { useMemo } from "react";
import type { Edge } from "@xyflow/react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RFEdgeData } from "../../utils/graphTransformers";

interface FallbackNodeSelectProps {
  nodeId: string;
  edges: Edge<RFEdgeData>[];
  globalNodeIds: string[];
  value: string | undefined;
  onChange: (nodeId: string | undefined) => void;
}

function hasNonToolEdges(edges: Edge<RFEdgeData>[]): boolean {
  return edges.some((e) => {
    const type = e.data?.preconditions?.[0]?.type;
    return type !== "tool_call";
  });
}

export function FallbackNodeSelect({ nodeId, edges, globalNodeIds, value, onChange }: FallbackNodeSelectProps) {
  const outgoing = useMemo(() => edges.filter((e) => e.source === nodeId), [edges, nodeId]);

  if (outgoing.length === 0 || !hasNonToolEdges(outgoing)) return null;

  const targetIds = outgoing.map((e) => e.target);
  const globalOptions = globalNodeIds.filter((id) => !targetIds.includes(id));
  const defaultTarget = targetIds[0] ?? "";
  const selected = value ?? defaultTarget;

  return (
    <div className="space-y-2 mt-3">
      <Label htmlFor="fallbackNode" className="text-xs">
        Fallback node
      </Label>
      <Select
        value={selected}
        onValueChange={(v) => {
          if (v) onChange(v === defaultTarget ? undefined : v);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {targetIds.map((id) => (
            <SelectItem key={id} value={id}>
              {id}
            </SelectItem>
          ))}
          {globalOptions.map((id) => (
            <SelectItem key={id} value={id}>
              {id} (global)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
