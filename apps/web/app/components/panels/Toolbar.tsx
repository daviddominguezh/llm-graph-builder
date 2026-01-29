"use client";

import { Bot, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NodeKind } from "../../schemas/graph.schema";

interface ToolbarProps {
  onImport: () => void;
  onExport: () => void;
}

export function Toolbar({ onImport, onExport }: ToolbarProps) {
  const onDragStart = (event: React.DragEvent, nodeKind: NodeKind) => {
    event.dataTransfer.setData("application/reactflow-kind", nodeKind);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <header className="flex items-center justify-center gap-6 border-b bg-background px-4 py-3">
      <div
        draggable
        onDragStart={(e) => onDragStart(e, "agent")}
        className="flex cursor-grab items-center gap-2 rounded-lg border-2 border-primary/30 bg-primary/10 px-3 py-1.5 transition-shadow hover:shadow-md active:cursor-grabbing"
      >
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Node</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onImport}>
          <Upload className="h-4 w-4" />
          Import
        </Button>
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>
    </header>
  );
}
