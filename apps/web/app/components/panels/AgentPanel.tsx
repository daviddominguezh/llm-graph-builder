"use client";

import { useState } from "react";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useGraphStore } from "../../stores/graphStore";

export function AgentPanel() {
  const agents = useGraphStore((s) => s.agents);
  const nodes = useGraphStore((s) => s.nodes);
  const addAgent = useGraphStore((s) => s.addAgent);
  const updateAgent = useGraphStore((s) => s.updateAgent);
  const deleteAgent = useGraphStore((s) => s.deleteAgent);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newId, setNewId] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const handleAdd = () => {
    if (newId.trim()) {
      addAgent({ id: newId.trim(), description: newDescription.trim() });
      setNewId("");
      setNewDescription("");
      setIsAdding(false);
    }
  };

  const handleUpdate = (id: string) => {
    if (newId.trim()) {
      updateAgent(id, { description: newDescription.trim() });
      setEditingId(null);
      setNewId("");
      setNewDescription("");
    }
  };

  const handleDelete = (id: string) => {
    const usedBy = nodes.filter((n) => n.agent === id);
    if (usedBy.length > 0) {
      const proceed = confirm(
        `This agent is used by ${usedBy.length} node(s). Delete anyway?`
      );
      if (!proceed) return;
    }
    deleteAgent(id);
  };

  const startEdit = (id: string, description: string) => {
    setEditingId(id);
    setNewId(id);
    setNewDescription(description);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAdding(false);
    setNewId("");
    setNewDescription("");
  };

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Agents
        </Label>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsAdding(true)}
          className="h-6 w-6"
          title="Add agent"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {agents.map((agent) => (
          <Card key={agent.id} className="p-2">
            {editingId === agent.id ? (
              <div className="flex flex-col gap-2">
                <Input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Description"
                  className="h-8 text-xs"
                />
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleUpdate(agent.id)}
                    className="h-6 w-6 text-green-500 hover:text-green-600"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={cancelEdit}
                    className="h-6 w-6"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{agent.id}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {agent.description}
                  </p>
                </div>
                <div className="ml-2 flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => startEdit(agent.id, agent.description)}
                    className="h-6 w-6"
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(agent.id)}
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}

        {isAdding && (
          <Card className="border-primary/30 bg-primary/5 p-2">
            <div className="flex flex-col gap-2">
              <Input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="Agent ID"
                className="h-8 text-xs"
                autoFocus
              />
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Description"
                className="h-8 text-xs"
              />
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleAdd}
                  className="h-6 w-6 text-green-500 hover:text-green-600"
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={cancelEdit}
                  className="h-6 w-6"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {agents.length === 0 && !isAdding && (
          <p className="text-xs text-muted-foreground">No agents yet</p>
        )}
      </div>
    </div>
  );
}
