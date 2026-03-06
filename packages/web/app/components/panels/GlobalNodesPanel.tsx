"use client";

import { useState } from "react";
import { Waypoints, Plus, Trash2, Pencil, X } from "lucide-react";
import type { Node } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  onAddNode?: () => void;
  onDeleteNode?: (nodeId: string) => void;
  onUpdateNode?: (nodeId: string, updates: { text?: string; description?: string }) => void;
  contextPreconditions: string[];
  onAddContextPrecondition?: (value: string) => void;
  onRemoveContextPrecondition?: (value: string) => void;
  onRenameContextPrecondition?: (oldValue: string, newValue: string) => void;
}

interface EditState {
  nodeId: string;
  text: string;
  description: string;
}

function EditNodeDialog({
  editState,
  onSave,
  onClose,
}: {
  editState: EditState;
  onSave: (nodeId: string, updates: { text: string; description: string }) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(editState.text);
  const [description, setDescription] = useState(editState.description);

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Edit global node</AlertDialogTitle>
        <AlertDialogDescription>
          Update the node ID and description.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="edit-node-text">ID</Label>
          <Input
            id="edit-node-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="edit-node-description">Description</Label>
          <Textarea
            id="edit-node-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={() => {
            onSave(editState.nodeId, { text, description });
            onClose();
          }}
        >
          Save
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

export function GlobalNodesPanel({
  nodes,
  onAddNode,
  onDeleteNode,
  onUpdateNode,
  contextPreconditions,
  onAddContextPrecondition,
  onRemoveContextPrecondition,
  onRenameContextPrecondition,
}: GlobalNodesPanelProps) {
  const [editState, setEditState] = useState<EditState | null>(null);
  const [newContextValue, setNewContextValue] = useState("");
  const [isAddingContext, setIsAddingContext] = useState(false);
  const [editingContext, setEditingContext] = useState<string | null>(null);
  const [editingContextValue, setEditingContextValue] = useState("");

  const globalNodes = nodes.filter(
    (n) => (n.data as RFNodeData).global === true,
  );

  const handleAddContext = () => {
    const trimmed = newContextValue.trim();
    if (trimmed && !contextPreconditions.includes(trimmed)) {
      onAddContextPrecondition?.(trimmed);
      setNewContextValue("");
      setIsAddingContext(false);
    }
  };

  const handleSaveContextRename = () => {
    const trimmed = editingContextValue.trim();
    if (editingContext && trimmed && trimmed !== editingContext && !contextPreconditions.includes(trimmed)) {
      onRenameContextPrecondition?.(editingContext, trimmed);
    }
    setEditingContext(null);
    setEditingContextValue("");
  };

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

      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
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
                    className="group/row relative rounded-md border px-3 py-2 text-left text-sm"
                  >
                    <div className="text-xs font-medium">{data.text}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {data.description || "No description"}
                    </div>
                    <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                      <AlertDialog
                        open={editState?.nodeId === node.id}
                        onOpenChange={(open) => {
                          if (!open) setEditState(null);
                        }}
                      >
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() =>
                                setEditState({
                                  nodeId: node.id,
                                  text: data.text,
                                  description: data.description,
                                })
                              }
                            >
                              <Pencil className="size-3" />
                            </Button>
                          }
                        />
                        {editState?.nodeId === node.id && (
                          <EditNodeDialog
                            editState={editState}
                            onSave={(nodeId, updates) =>
                              onUpdateNode?.(nodeId, updates)
                            }
                            onClose={() => setEditState(null)}
                          />
                        )}
                      </AlertDialog>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="destructive"
                              size="icon-xs"
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

        <div className="flex items-center gap-2 border-y px-4 py-3">
          <h2 className="text-sm font-semibold">Context Preconditions</h2>
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            onClick={() => setIsAddingContext(true)}
          >
            <Plus className="size-3" />
          </Button>
        </div>

        <div className="p-4">

          {isAddingContext && (
            <div className="flex gap-1 mb-3">
              <Input
                value={newContextValue}
                onChange={(e) => setNewContextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddContext();
                  if (e.key === "Escape") setIsAddingContext(false);
                }}
                placeholder="PRECONDITION_NAME"
                className="h-7 text-xs"
                autoFocus
              />
              <Button size="xs" onClick={handleAddContext}>
                Add
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  setIsAddingContext(false);
                  setNewContextValue("");
                }}
              >
                <X className="size-3" />
              </Button>
            </div>
          )}

          {contextPreconditions.length === 0 && !isAddingContext ? (
            <p className="text-xs text-muted-foreground">
              No context preconditions yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {contextPreconditions.map((cp) => (
                <li
                  key={cp}
                  className="group/ctx flex items-center justify-between gap-1 rounded-md border px-3 py-1.5"
                >
                  {editingContext === cp ? (
                    <Input
                      value={editingContextValue}
                      onChange={(e) => setEditingContextValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveContextRename();
                        if (e.key === "Escape") {
                          setEditingContext(null);
                          setEditingContextValue("");
                        }
                      }}
                      onBlur={handleSaveContextRename}
                      className="h-6 text-xs font-mono"
                      autoFocus
                    />
                  ) : (
                    <>
                      <span className="text-xs font-mono">{cp}</span>
                      <div className="flex gap-1 opacity-0 group-hover/ctx:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => {
                            setEditingContext(cp);
                            setEditingContextValue(cp);
                          }}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon-xs"
                          onClick={() => onRemoveContextPrecondition?.(cp)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
