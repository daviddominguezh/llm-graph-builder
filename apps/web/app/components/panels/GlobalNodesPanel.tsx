"use client";

import { Waypoints, Plus, Trash2 } from "lucide-react";
import type { Node } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { RFNodeData } from "../../utils/graphTransformers";

interface GlobalNodesPanelProps {
  nodes: Node<RFNodeData>[];
  onSelectNode?: (nodeId: string) => void;
  onAddNode?: () => void;
  onDeleteNode?: (nodeId: string) => void;
}

export function GlobalNodesPanel({
  nodes,
  onSelectNode,
  onAddNode,
  onDeleteNode,
}: GlobalNodesPanelProps) {
  const globalNodes = nodes.filter(
    (n) => (n.data as RFNodeData).global === true,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Waypoints className="size-4" />
        <h2 className="text-sm font-semibold">Global Nodes</h2>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          onClick={onAddNode}
        >
          <Plus className="size-3" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {globalNodes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No global nodes yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {globalNodes.map((node) => {
              const data = node.data as RFNodeData;
              return (
                <li
                  key={node.id}
                  className="group/row relative rounded-md border px-3 py-2 text-left text-sm hover:bg-muted transition-colors cursor-pointer"
                  onClick={() => onSelectNode?.(node.id)}
                >
                  <div className="text-xs font-medium">{data.text}</div>
                  {data.description && (
                    <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {data.description}
                    </div>
                  )}
                  <div className="absolute top-1.5 right-1.5 opacity-0 group-hover/row:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      }
                    />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete global node</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete &quot;{data.text}&quot;? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDeleteNode?.(node.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
