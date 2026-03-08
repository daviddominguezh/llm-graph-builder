"use client";

import { useState } from "react";
import { ChevronDown, Eye, EyeOff, Plus, Trash2, SlidersHorizontal } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { type ContextPreset, DEFAULT_PRESET } from "../../types/preset";
import type { McpServerConfig } from "../../schemas/graph.schema";
import type { DiscoveredTool } from "../../lib/api";
import { McpServersSection } from "./McpServersSection";

interface McpProps {
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
  discovering: Record<string, boolean>;
  onAddServer: () => void;
  onRemoveServer: (id: string) => void;
  onUpdateServer: (id: string, updates: Partial<McpServerConfig>) => void;
  onDiscoverTools: (id: string) => void;
}

interface PresetsPanelProps {
  presets: ContextPreset[];
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ContextPreset>) => void;
  mcp: McpProps;
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
  isDefault,
  onDelete,
  onUpdate,
}: {
  preset: ContextPreset;
  isDefault: boolean;
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
          <ChevronDown
            className={`size-3 transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
          {preset.name}
        </button>
        {!isDefault && (
          <div className="flex gap-1">
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="destructive" size="icon-xs" title="Delete preset">
                    <Trash2 className="size-3" />
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete preset?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the preset &quot;{preset.name}&quot;.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={onDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
      {expanded && <PresetFields preset={preset} onUpdate={onUpdate} />}
    </li>
  );
}

export function PresetsPanel({
  presets,
  apiKey,
  onApiKeyChange,
  onAdd,
  onDelete,
  onUpdate,
  mcp,
}: PresetsPanelProps) {
  const [showApiKey, setShowApiKey] = useState(false);

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
        <div className="mb-4 space-y-1">
          <Label>API Key</Label>
          <div className="relative">
            <Input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="Enter API key..."
              className="pr-9"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => setShowApiKey((prev) => !prev)}
            >
              {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
          <Separator className="mt-3" />
        </div>
        <ul className="space-y-2">
          {presets.map((preset) => (
            <PresetItem
              key={preset.id}
              preset={preset}
              isDefault={preset.id === DEFAULT_PRESET.id}
              onDelete={() => onDelete(preset.id)}
              onUpdate={onUpdate}
            />
          ))}
        </ul>
        <Separator className="mt-4" />
        <McpServersSection
          servers={mcp.servers}
          discoveredTools={mcp.discoveredTools}
          discovering={mcp.discovering}
          onAdd={mcp.onAddServer}
          onRemove={mcp.onRemoveServer}
          onUpdate={mcp.onUpdateServer}
          onDiscover={mcp.onDiscoverTools}
        />
      </div>
    </div>
  );
}
