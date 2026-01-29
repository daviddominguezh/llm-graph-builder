"use client";

import { useState, useEffect, useRef } from "react";
import { Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGraphStore } from "../../stores/graphStore";
import type { NodeKind } from "../../schemas/graph.schema";

interface NodePanelProps {
  nodeId: string;
}

export function NodePanel({ nodeId }: NodePanelProps) {
  const nodes = useGraphStore((s) => s.nodes);
  const agents = useGraphStore((s) => s.agents);
  const startNode = useGraphStore((s) => s.startNode);
  const updateNode = useGraphStore((s) => s.updateNode);
  const deleteNode = useGraphStore((s) => s.deleteNode);
  const setStartNode = useGraphStore((s) => s.setStartNode);

  const node = nodes.find((n) => n.id === nodeId);
  const prevNodeIdRef = useRef<string | null>(null);

  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<NodeKind>("agent");
  const [agent, setAgent] = useState("");
  const [nextNodeIsUser, setNextNodeIsUser] = useState(false);

  useEffect(() => {
    // Only reset form when selecting a different node
    if (prevNodeIdRef.current !== nodeId) {
      const currentNode = nodes.find((n) => n.id === nodeId);
      if (currentNode) {
        setText(currentNode.text);
        setDescription(currentNode.description);
        setKind(currentNode.kind);
        setAgent(currentNode.agent ?? "");
        setNextNodeIsUser(currentNode.nextNodeIsUser ?? false);
      }
      prevNodeIdRef.current = nodeId;
    }
  }, [nodeId, nodes]);

  if (!node) {
    return <div className="p-4 text-muted-foreground">Node not found</div>;
  }

  const handleSave = () => {
    updateNode(nodeId, {
      text,
      description,
      kind,
      agent: agent || undefined,
      nextNodeIsUser: nextNodeIsUser || undefined,
    });
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this node?")) {
      deleteNode(nodeId);
    }
  };

  const handleSetStartNode = () => {
    setStartNode(nodeId);
  };

  const isStartNode = startNode === nodeId;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Node Properties</h2>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSetStartNode}
              className={isStartNode ? "text-yellow-600" : "text-muted-foreground"}
              title={isStartNode ? "This is the start node" : "Set as start node"}
            >
              <Star className="h-4 w-4" fill={isStartNode ? "currentColor" : "none"} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              className="text-muted-foreground hover:text-destructive"
              title="Delete node"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">ID: {nodeId}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="isDecisionNode"
              checked={kind === "agent_decision"}
              onCheckedChange={(checked) =>
                setKind(checked ? "agent_decision" : "agent")
              }
            />
            <Label htmlFor="isDecisionNode">Is decision node?</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="text">Text</Label>
            <Textarea
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Node text..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Node description..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent">Agent</Label>
            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger>
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

          <div className="flex items-center gap-2">
            <Checkbox
              id="nextNodeIsUser"
              checked={nextNodeIsUser}
              onCheckedChange={(checked) => setNextNodeIsUser(checked === true)}
            />
            <Label htmlFor="nextNodeIsUser">Next node expects user input</Label>
          </div>
        </div>
      </div>

      <div className="border-t p-4">
        <Button onClick={handleSave} className="w-full">
          Save Changes
        </Button>
      </div>
    </div>
  );
}
