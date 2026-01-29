"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useGraphStore } from "../../stores/graphStore";

interface NodePanelProps {
  nodeId: string;
}

export function NodePanel({ nodeId }: NodePanelProps) {
  const nodes = useGraphStore((s) => s.nodes);
  const agents = useGraphStore((s) => s.agents);
  const updateNode = useGraphStore((s) => s.updateNode);
  const renameNode = useGraphStore((s) => s.renameNode);
  const deleteNode = useGraphStore((s) => s.deleteNode);

  const node = nodes.find((n) => n.id === nodeId);

  const [prevNodeId, setPrevNodeId] = useState(nodeId);
  const [id, setId] = useState(node?.id ?? "");

  // Reset form when selecting a different node (React recommended pattern)
  if (nodeId !== prevNodeId) {
    setPrevNodeId(nodeId);
    const currentNode = nodes.find((n) => n.id === nodeId);
    if (currentNode) {
      setId(currentNode.id);
    }
  }

  if (!node) {
    return <div className="p-4 text-muted-foreground">Node not found</div>;
  }

  const handleIdBlur = () => {
    if (id !== nodeId && id.trim()) {
      renameNode(nodeId, id);
    }
  };

  const handleDelete = () => {
    deleteNode(nodeId);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-2 px-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Node Properties</h4>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  title="Delete node"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete node?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the node and remove all its connections.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="id">ID</Label>
            <Input
              id="id"
              value={id}
              onChange={(e) => setId(e.target.value)}
              onBlur={handleIdBlur}
              placeholder="Node ID..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="text">Text</Label>
            <Textarea
              id="text"
              value={node.text}
              onChange={(e) => updateNode(nodeId, { text: e.target.value })}
              rows={3}
              placeholder="Node text..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={node.description}
              onChange={(e) => updateNode(nodeId, { description: e.target.value })}
              rows={2}
              placeholder="Node description..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent">Agent</Label>
            <Select
              value={node.agent ?? ""}
              onValueChange={(value) => updateNode(nodeId, { agent: value || undefined })}
              disabled={agents.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select agent..." />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="isDecisionNode"
                checked={node.kind === "agent_decision"}
                onCheckedChange={(checked) =>
                  updateNode(nodeId, { kind: checked ? "agent_decision" : "agent" })
                }
              />
              <Label htmlFor="isDecisionNode">Is this a decision node?</Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="nextNodeIsUser"
                checked={node.nextNodeIsUser ?? false}
                onCheckedChange={(checked) =>
                  updateNode(nodeId, { nextNodeIsUser: checked === true || undefined })
                }
              />
              <Label htmlFor="nextNodeIsUser">Next node expects user input</Label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
