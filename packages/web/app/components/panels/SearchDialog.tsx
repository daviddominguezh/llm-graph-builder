"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SearchableNode {
  id: string;
  text: string;
}

interface SearchDialogProps {
  nodes: SearchableNode[];
  open: boolean;
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
}

function filterNodes(nodes: SearchableNode[], query: string): SearchableNode[] {
  if (query === "") return nodes;
  const lower = query.toLowerCase();
  return nodes.filter(
    (n) => n.id.toLowerCase().includes(lower) || n.text.toLowerCase().includes(lower)
  );
}

export function SearchDialog({ nodes, open, onClose, onSelectNode }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevOpen, setPrevOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset state when dialog opens (sync pattern, no effect needed)
  if (open && !prevOpen) {
    setPrevOpen(true);
    setQuery("");
    setActiveIndex(0);
  }
  if (!open && prevOpen) {
    setPrevOpen(false);
  }

  const results = filterNodes(nodes, query);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  const handleSelect = useCallback(
    (nodeId: string) => {
      onSelectNode(nodeId);
      onClose();
    },
    [onSelectNode, onClose]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      const selected = results[activeIndex];
      if (selected) handleSelect(selected.id);
    }
  };

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="absolute top-16 left-1/2 z-20 -translate-x-1/2 w-[28rem] h-80 flex flex-col rounded-lg border bg-background shadow-lg"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <Search className="size-3.5 text-muted-foreground shrink-0" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
          onKeyDown={handleKeyDown}
          placeholder="Search nodes..."
          className="h-7 border-0 bg-transparent! p-0 text-xs shadow-none focus-visible:ring-0"
        />
      </div>
      <ul className="flex-1 overflow-y-auto p-1">
        {results.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">No results</li>
        ) : (
          results.map((node, i) => (
            <li key={node.id}>
              <Button
                variant="ghost"
                className={`flex h-auto w-full flex-col items-start justify-center rounded-md px-3 py-1.5 text-left text-xs ${
                  i === activeIndex ? "bg-accent/10" : "hover:bg-accent/5"
                }`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => handleSelect(node.id)}
              >
                <span className="font-medium">{node.id}</span>
                <span className="text-[10px] text-muted-foreground truncate">{node.text}</span>
              </Button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
