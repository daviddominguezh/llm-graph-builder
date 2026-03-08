"use client";

import { useState } from "react";
import { ChevronDown, Eye, EyeOff, Plus, Trash2, SlidersHorizontal, X } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { type ContextPreset, DEFAULT_PRESET } from "../../types/preset";
import type { McpServerConfig } from "../../schemas/graph.schema";
import type { McpServerStatus } from "../../hooks/useMcpServers";
import { McpServersSection } from "./McpServersSection";
import { ContextPreconditionsSection } from "./ContextPreconditionsSection";

interface McpProps {
  servers: McpServerConfig[];
  discovering: Record<string, boolean>;
  serverStatus: Record<string, McpServerStatus>;
  onAddServer: () => void;
  onRemoveServer: (id: string) => void;
  onUpdateServer: (id: string, updates: Partial<McpServerConfig>) => void;
  onDiscoverTools: (id: string) => void;
}

interface ContextKeysProps {
  keys: string[];
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
  onRename: (oldKey: string, newKey: string) => void;
}

interface ContextPreconditionsProps {
  preconditions: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  onRename: (oldValue: string, newValue: string) => void;
}

interface PresetsPanelProps {
  presets: ContextPreset[];
  apiKey: string;
  contextKeys: string[];
  onApiKeyChange: (key: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ContextPreset>) => void;
  context: ContextKeysProps;
  contextPreconditions: ContextPreconditionsProps;
  mcp: McpProps;
}

interface PresetFieldsProps {
  preset: ContextPreset;
  contextKeys: string[];
  onUpdate: (id: string, updates: Partial<ContextPreset>) => void;
}

function ContextValueField({ preset, keyName, onUpdate }: {
  preset: ContextPreset;
  keyName: string;
  onUpdate: (id: string, updates: Partial<ContextPreset>) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{keyName}</Label>
      <Input
        value={String(preset.data[keyName] ?? '')}
        onChange={(e) => onUpdate(preset.id, { data: { ...preset.data, [keyName]: e.target.value } })}
        placeholder={`Value for ${keyName}`}
      />
    </div>
  );
}

function PresetFields({ preset, contextKeys, onUpdate }: PresetFieldsProps) {
  return (
    <div className="space-y-2 mt-2">
      <div className="space-y-1">
        <Label>Name</Label>
        <Input
          value={preset.name}
          onChange={(e) => onUpdate(preset.id, { name: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Session ID</Label>
        <Input
          value={preset.sessionID}
          onChange={(e) => onUpdate(preset.id, { sessionID: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Tenant ID</Label>
        <Input
          value={preset.tenantID}
          onChange={(e) => onUpdate(preset.id, { tenantID: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>User ID</Label>
        <Input
          value={preset.userID}
          onChange={(e) => onUpdate(preset.id, { userID: e.target.value })}
        />
      </div>
      {contextKeys.map((key) => (
        <ContextValueField
          key={key}
          preset={preset}
          keyName={key}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}

function ContextKeyRow({ keyName, onRemove, onRename }: {
  keyName: string;
  onRemove: () => void;
  onRename: (newKey: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        value={keyName}
        onChange={(e) => onRename(e.target.value)}
        className="flex-1"
      />
      <Button variant="ghost" size="icon-xs" onClick={onRemove}>
        <X className="size-3" />
      </Button>
    </div>
  );
}

function ContextKeysSection({ keys, onAdd, onRemove, onRename }: ContextKeysProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <Label>Context</Label>
        <Button variant="ghost" size="icon-xs" onClick={() => onAdd('')}>
          <Plus className="size-3" />
        </Button>
      </div>
      {keys.length > 0 && (
        <div className="space-y-1">
          {keys.map((key, index) => (
            <ContextKeyRow
              key={index}
              keyName={key}
              onRemove={() => onRemove(key)}
              onRename={(newKey) => onRename(key, newKey)}
            />
          ))}
        </div>
      )}
      <Separator className="mt-3" />
    </div>
  );
}

function PresetItem({
  preset,
  contextKeys,
  isDefault,
  onDelete,
  onUpdate,
}: {
  preset: ContextPreset;
  contextKeys: string[];
  isDefault: boolean;
  onDelete: () => void;
  onUpdate: (id: string, updates: Partial<ContextPreset>) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-md border px-3 py-2">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <ChevronDown
            className={`size-3 transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
          {preset.name}
        </span>
        {!isDefault && (
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
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
      {expanded && <PresetFields preset={preset} contextKeys={contextKeys} onUpdate={onUpdate} />}
    </li>
  );
}

export function PresetsPanel({
  presets,
  apiKey,
  contextKeys,
  onApiKeyChange,
  onAdd,
  onDelete,
  onUpdate,
  context,
  contextPreconditions,
  mcp,
}: PresetsPanelProps) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <SlidersHorizontal className="size-4" />
        <h2 className="text-sm font-semibold">Context Presets</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 space-y-1">
          <Label>OpenRouter API Key</Label>
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
        <ContextKeysSection
          keys={contextKeys}
          onAdd={context.onAdd}
          onRemove={context.onRemove}
          onRename={context.onRename}
        />
        <ContextPreconditionsSection
          preconditions={contextPreconditions.preconditions}
          onAdd={contextPreconditions.onAdd}
          onRemove={contextPreconditions.onRemove}
          onRename={contextPreconditions.onRename}
        />
        <div className="flex items-center justify-between mb-1">
          <Label>Testing Presets</Label>
          <Button variant="ghost" size="icon-xs" onClick={onAdd}>
            <Plus className="size-3" />
          </Button>
        </div>
        <ul className="space-y-2">
          {presets.map((preset) => (
            <PresetItem
              key={preset.id}
              preset={preset}
              contextKeys={contextKeys}
              isDefault={preset.id === DEFAULT_PRESET.id}
              onDelete={() => onDelete(preset.id)}
              onUpdate={onUpdate}
            />
          ))}
        </ul>
        <Separator className="mt-4" />
        <McpServersSection
          servers={mcp.servers}
          discovering={mcp.discovering}
          serverStatus={mcp.serverStatus}
          onAdd={mcp.onAddServer}
          onRemove={mcp.onRemoveServer}
          onUpdate={mcp.onUpdateServer}
          onDiscover={mcp.onDiscoverTools}
        />
      </div>
    </div>
  );
}
