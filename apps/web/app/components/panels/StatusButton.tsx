"use client";

import { useMemo } from "react";
import { CircleCheck, CircleAlert } from "lucide-react";
import type { Node, Edge } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { validateGraph } from "../../utils/graphValidation";
import type { RFNodeData, RFEdgeData } from "../../utils/graphTransformers";

interface StatusButtonProps {
  nodes: Node<RFNodeData>[];
  edges: Edge<RFEdgeData>[];
}

export function StatusButton({ nodes, edges }: StatusButtonProps) {
  const errors = useMemo(() => validateGraph(nodes, edges), [nodes, edges]);
  const isOk = errors.length === 0;

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="outline" className="bg-white">
            {isOk ? (
              <>
                <CircleCheck className="h-3.5 w-3.5 text-green-500" />
                <span className="text-green-600">Status: OK</span>
              </>
            ) : (
              <>
                <CircleAlert className="h-3.5 w-3.5 text-red-500" />
                <span className="text-red-600">Status: ERROR</span>
              </>
            )}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isOk ? "Graph Validation" : "Validation Errors"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isOk
              ? "All validations passed. The graph is valid."
              : `Found ${errors.length} validation error${errors.length !== 1 ? "s" : ""}:`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!isOk && (
          <ul className="space-y-1.5 text-xs text-red-600">
            {errors.map((error) => (
              <li key={error.message} className="flex items-start gap-1.5">
                <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{error.message}</span>
              </li>
            ))}
          </ul>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
