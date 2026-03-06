"use client";

import { useState } from "react";
import { Plus, Trash2, SlidersHorizontal, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { ContextPreset } from "../../types/preset";

interface PresetsPanelProps {
  presets: ContextPreset[];
  activePresetId: string;
  onSetActive: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ContextPreset>) => void;
}

interface PresetFieldsProps {
  preset: ContextPreset;
  onUpdate: (id: string, updates: Partial<ContextPreset>) => void;
}

function PresetFields({ preset, onUpdate }: PresetFieldsProps) {
  return (
    <div className="space-y-2 mt-2">
      <div className="space-y-1">
        <Label className="text-[10px]">Name</Label>
        <Input
          value={preset.name}
          onChange={(e) => onUpdate(preset.id, { name: e.target.value })}
          className="h-6 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">Session ID</Label>
        <Input
          value={preset.sessionID}
          onChange={(e) => onUpdate(preset.id, { sessionID: e.target.value })}
          className="h-6 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">Tenant ID</Label>
        <Input
          value={preset.tenantID}
          onChange={(e) => onUpdate(preset.id, { tenantID: e.target.value })}
          className="h-6 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">User ID</Label>
        <Input
          value={preset.userID}
          onChange={(e) => onUpdate(preset.id, { userID: e.target.value })}
          className="h-6 text-xs"
        />
      </div>
      <DataField preset={preset} onUpdate={onUpdate} />
    </div>
  );
}

function DataField({
  preset,
  onUpdate,
}: PresetFieldsProps) {
  const [rawData, setRawData] = useState(JSON.stringify(preset.data, null, 2));
  const [dataError, setDataError] = useState(false);

  const handleDataChange = (value: string) => {
    setRawData(value);
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        onUpdate(preset.id, { data: parsed as Record<string, unknown> });
        setDataError(false);
      }
    } catch {
      setDataError(true);
    }
  };

  return (
    <div className="space-y-1">
      <Label className="text-[10px]">Data (JSON)</Label>
      <Textarea
        value={rawData}
        onChange={(e) => handleDataChange(e.target.value)}
        rows={3}
        className={`text-xs font-mono ${dataError ? "border-destructive" : ""}`}
      />
    </div>
  );
}

function PresetItem({
  preset,
  isActive,
  onSetActive,
  onDelete,
  onUpdate,
}: {
  preset: ContextPreset;
  isActive: boolean;
  onSetActive: () => void;
  onDelete: () => void;
  onUpdate: (id: string, updates: Partial<ContextPreset>) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-md border px-3 py-2">
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1.5 text-xs font-medium"
          onClick={() => setExpanded(!expanded)}
        >
          {isActive && <Check className="size-3 text-green-600" />}
          {preset.name}
        </button>
        <div className="flex gap-1">
          {!isActive && (
            <Button variant="ghost" size="icon-xs" onClick={onSetActive} title="Set active">
              <Check className="size-3" />
            </Button>
          )}
          <Button
            variant="destructive"
            size="icon-xs"
            onClick={onDelete}
            title="Delete preset"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
      {expanded && <PresetFields preset={preset} onUpdate={onUpdate} />}
    </li>
  );
}

export function PresetsPanel({
  presets,
  activePresetId,
  onSetActive,
  onAdd,
  onDelete,
  onUpdate,
}: PresetsPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <SlidersHorizontal className="size-4" />
        <h2 className="text-sm font-semibold">Context Presets</h2>
        <Button variant="ghost" size="icon-xs" className="ml-auto" onClick={onAdd}>
          <Plus className="size-3" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-2">
          {presets.map((preset) => (
            <PresetItem
              key={preset.id}
              preset={preset}
              isActive={preset.id === activePresetId}
              onSetActive={() => onSetActive(preset.id)}
              onDelete={() => onDelete(preset.id)}
              onUpdate={onUpdate}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
