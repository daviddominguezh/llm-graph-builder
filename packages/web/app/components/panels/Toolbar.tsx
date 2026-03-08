"use client";

import type { ReactNode } from "react";
import { Upload, Download, WandSparkles, Play, Waypoints, SlidersHorizontal, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface ToolbarProps {
  onAddNode: () => void;
  onImport: () => void;
  onExport: () => void;
  onPlay?: () => void;
  simulationActive?: boolean;
  statusSlot?: ReactNode;
  globalPanelOpen?: boolean;
  onToggleGlobalPanel?: () => void;
  onTogglePresets?: () => void;
  onToggleTools?: () => void;
}

export function Toolbar({
  onImport,
  onExport,
  onPlay,
  simulationActive,
  statusSlot,
  onToggleGlobalPanel,
  onTogglePresets,
  onToggleTools,
}: ToolbarProps) {
  return (
    <header className="absolute z-1 flex items-stretch justify-center gap-1 border rounded-lg bg-background p-1 top-2 shadow-lg">
      <Button
        className="h-10 w-10"
        variant={simulationActive ? 'default' : 'ghost'}
        size="sm"
        onClick={onPlay}
      >
        <Play className="size-4" />
      </Button>
      <Button className="h-10 w-10" variant="ghost" size="sm" onClick={onImport}>
        <Upload className="size-4" />
      </Button>
      <Button className="h-10 w-10" variant="ghost" size="sm" onClick={onExport}>
        <Download className="size-4" />
      </Button>
      <Button className="h-10 w-10" variant="ghost" size="sm">
        <WandSparkles className="size-4" />
      </Button>
      {statusSlot && (
        <>
          <Separator orientation="vertical" />
          {statusSlot}
        </>
      )}
      {onToggleGlobalPanel && (
        <>
          <Separator orientation="vertical" />
          <Button
            className="h-10 w-10"
            variant="ghost"
            size="sm"
            onClick={onToggleGlobalPanel}
          >
            <Waypoints className="size-4" />
          </Button>
        </>
      )}
      {onTogglePresets && (
        <>
          <Separator orientation="vertical" />
          <Button
            className="h-10 w-10"
            variant="ghost"
            size="sm"
            onClick={onTogglePresets}
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        </>
      )}
      {onToggleTools && (
        <>
          <Separator orientation="vertical" />
          <Button
            className="h-10 w-10"
            variant="ghost"
            size="sm"
            onClick={onToggleTools}
          >
            <Wrench className="size-4" />
          </Button>
        </>
      )}
    </header>
  );
}
