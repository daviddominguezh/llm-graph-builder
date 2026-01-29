"use client";

import { useState, useEffect } from "react";
import { Trash2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { useGraphStore } from "../../stores/graphStore";
import type { Precondition, PreconditionType } from "../../schemas/graph.schema";

interface EdgePanelProps {
  edgeId: string;
}

export function EdgePanel({ edgeId }: EdgePanelProps) {
  const edges = useGraphStore((s) => s.edges);
  const updateEdge = useGraphStore((s) => s.updateEdge);
  const deleteEdge = useGraphStore((s) => s.deleteEdge);

  const [from, to] = edgeId.split("-");
  const edge = edges.find((e) => e.from === from && e.to === to);

  const [preconditions, setPreconditions] = useState<Precondition[]>([]);
  const [isAddingPrecondition, setIsAddingPrecondition] = useState(false);
  const [newPreconditionType, setNewPreconditionType] =
    useState<PreconditionType>("user_said");
  const [newPreconditionValue, setNewPreconditionValue] = useState("");
  const [newPreconditionDescription, setNewPreconditionDescription] =
    useState("");

  useEffect(() => {
    if (edge) {
      setPreconditions(edge.preconditions ?? []);
    }
  }, [edge]);

  if (!edge) {
    return <div className="p-4 text-muted-foreground">Edge not found</div>;
  }

  const existingType = preconditions.length > 0 ? preconditions[0].type : null;

  const handleAddPrecondition = () => {
    if (newPreconditionValue.trim()) {
      const newPrecondition: Precondition = {
        type: existingType ?? newPreconditionType,
        value: newPreconditionValue.trim(),
        description: newPreconditionDescription.trim() || undefined,
      };
      const newPreconditions = [...preconditions, newPrecondition];
      setPreconditions(newPreconditions);
      updateEdge(from, to, { preconditions: newPreconditions });
      setNewPreconditionValue("");
      setNewPreconditionDescription("");
      setIsAddingPrecondition(false);
    }
  };

  const handleRemovePrecondition = (index: number) => {
    const newPreconditions = preconditions.filter((_, i) => i !== index);
    setPreconditions(newPreconditions);
    updateEdge(from, to, {
      preconditions: newPreconditions.length > 0 ? newPreconditions : undefined,
    });
  };

  const handleDeleteEdge = () => {
    if (confirm("Are you sure you want to delete this edge?")) {
      deleteEdge(from, to);
    }
  };

  const getTypeColor = (type: PreconditionType) => {
    switch (type) {
      case "user_said":
        return "bg-green-100 text-green-700";
      case "agent_decision":
        return "bg-purple-100 text-purple-700";
      case "tool_call":
        return "bg-orange-100 text-orange-700";
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edge Properties</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDeleteEdge}
            className="text-muted-foreground hover:text-destructive"
            title="Delete edge"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {from} → {to}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Preconditions</Label>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsAddingPrecondition(true)}
                className="h-6 w-6"
                title="Add precondition"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {existingType && (
              <p className="mb-2 text-xs text-muted-foreground">
                Type locked to:{" "}
                <span className={`rounded px-1 py-0.5 ${getTypeColor(existingType)}`}>
                  {existingType}
                </span>
              </p>
            )}

            <div className="flex flex-col gap-2">
              {preconditions.map((p, index) => (
                <Card key={index} className="p-2">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs ${getTypeColor(p.type)}`}
                      >
                        {p.type}
                      </span>
                      <p className="mt-1 text-sm">{p.value}</p>
                      {p.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {p.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemovePrecondition(index)}
                      className="ml-2 h-6 w-6 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </Card>
              ))}

              {preconditions.length === 0 && !isAddingPrecondition && (
                <p className="text-xs text-muted-foreground">No preconditions</p>
              )}

              {isAddingPrecondition && (
                <Card className="border-primary/30 bg-primary/5 p-3">
                  <div className="flex flex-col gap-2">
                    {!existingType && (
                      <div className="space-y-1">
                        <Label className="text-xs">Type</Label>
                        <Select
                          value={newPreconditionType}
                          onValueChange={(value) =>
                            setNewPreconditionType(value as PreconditionType)
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user_said">user_said</SelectItem>
                            <SelectItem value="agent_decision">
                              agent_decision
                            </SelectItem>
                            <SelectItem value="tool_call">tool_call</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs">Value</Label>
                      <Textarea
                        value={newPreconditionValue}
                        onChange={(e) => setNewPreconditionValue(e.target.value)}
                        placeholder="Precondition value..."
                        rows={2}
                        className="text-xs"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description (optional)</Label>
                      <Input
                        value={newPreconditionDescription}
                        onChange={(e) =>
                          setNewPreconditionDescription(e.target.value)
                        }
                        placeholder="Description..."
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsAddingPrecondition(false)}
                      >
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleAddPrecondition}>
                        Add
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
