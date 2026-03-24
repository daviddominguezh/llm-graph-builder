"use client";

import { useState } from "react";
import { useTranslations } from 'next-intl';
import { ChevronDown, Plus, Trash2, Settings, X } from "lucide-react";

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
import type { OutputSchemaEntity } from '@daviddh/graph-types';
import type { ApiKeyRow } from "../../lib/api-keys";
import { ApiKeySelectSection } from "./ApiKeySelectSection";
import { type ContextPreset, DEFAULT_PRESET } from "../../types/preset";
import type { ContextPrecondition } from "../../types/contextPrecondition";
import { ContextPreconditionsSection } from "./ContextPreconditionsSection";
import { AgentDangerZone } from './AgentDangerZone';
import { OutputSchemasSection } from "./OutputSchemasSection";

interface ContextKeysProps {
  keys: string[];
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
  onRename: (oldKey: string, newKey: string) => void;
}

interface ContextPreconditionsProps {
  preconditions: ContextPrecondition[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ContextPrecondition>) => void;
}

interface OutputSchemasProps {
  schemas: OutputSchemaEntity[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

interface PresetsPanelProps {
  presets: ContextPreset[];
  contextKeys: string[];
  orgApiKeys: ApiKeyRow[];
  stagingKeyId: string | null;
  productionKeyId: string | null;
  onStagingKeyChange: (keyId: string | null) => void;
  onProductionKeyChange: (keyId: string | null) => void;
  agentId: string;
  agentName: string;
  orgSlug: string;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ContextPreset>) => void;
  context: ContextKeysProps;
  contextPreconditions: ContextPreconditionsProps;
  outputSchemas: OutputSchemasProps;
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
    <div className="mb-3">
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

export function PresetsPanel(props: PresetsPanelProps) {
  const t = useTranslations('toolbar');

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <h2 className="text-sm font-semibold">{t('settings')}</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3 px-2">
        <ApiKeySelectSection
          orgApiKeys={props.orgApiKeys}
          stagingKeyId={props.stagingKeyId}
          productionKeyId={props.productionKeyId}
          onStagingKeyChange={props.onStagingKeyChange}
          onProductionKeyChange={props.onProductionKeyChange}
        />
        <ContextKeysSection
          keys={props.contextKeys}
          onAdd={props.context.onAdd}
          onRemove={props.context.onRemove}
          onRename={props.context.onRename}
        />
        <OutputSchemasSection
          schemas={props.outputSchemas.schemas}
          onAdd={props.outputSchemas.onAdd}
          onRemove={props.outputSchemas.onRemove}
          onEdit={props.outputSchemas.onEdit}
        />
        <ContextPreconditionsSection
          preconditions={props.contextPreconditions.preconditions}
          contextKeys={props.contextKeys}
          onAdd={props.contextPreconditions.onAdd}
          onRemove={props.contextPreconditions.onRemove}
          onUpdate={props.contextPreconditions.onUpdate}
        />
        <div className="flex items-center justify-between mb-1">
          <Label>Testing Presets</Label>
          <Button variant="ghost" size="icon-xs" onClick={props.onAdd}>
            <Plus className="size-3" />
          </Button>
        </div>
        <ul className="space-y-2">
          {props.presets.map((preset) => (
            <PresetItem
              key={preset.id}
              preset={preset}
              contextKeys={props.contextKeys}
              isDefault={preset.id === DEFAULT_PRESET.id}
              onDelete={() => props.onDelete(preset.id)}
              onUpdate={props.onUpdate}
            />
          ))}
        </ul>
        <AgentDangerZone agentId={props.agentId} agentName={props.agentName} orgSlug={props.orgSlug} />
      </div>
    </div>
  );
}
