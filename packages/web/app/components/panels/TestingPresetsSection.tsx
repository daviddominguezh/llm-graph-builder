'use client';

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
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type ContextPreset, DEFAULT_PRESET } from '../../types/preset';

export interface TestingPresetsSectionProps {
  presets: ContextPreset[];
  contextKeys: string[];
  onAdd: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ContextPreset>) => void;
}

function ContextValueField({
  preset,
  keyName,
  onUpdate,
}: {
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

interface PresetFieldsProps {
  preset: ContextPreset;
  contextKeys: string[];
  onUpdate: (id: string, updates: Partial<ContextPreset>) => void;
}

function PresetFields({ preset, contextKeys, onUpdate }: PresetFieldsProps) {
  const t = useTranslations('testingPresets');
  return (
    <div className="space-y-2 mt-2">
      <div className="space-y-1">
        <Label>{t('name')}</Label>
        <Input value={preset.name} onChange={(e) => onUpdate(preset.id, { name: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>{t('sessionId')}</Label>
        <Input
          value={preset.sessionID}
          onChange={(e) => onUpdate(preset.id, { sessionID: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>{t('tenantId')}</Label>
        <Input value={preset.tenantID} onChange={(e) => onUpdate(preset.id, { tenantID: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>{t('userId')}</Label>
        <Input value={preset.userID} onChange={(e) => onUpdate(preset.id, { userID: e.target.value })} />
      </div>
      {contextKeys.map((key) => (
        <ContextValueField key={key} preset={preset} keyName={key} onUpdate={onUpdate} />
      ))}
    </div>
  );
}

function DeletePresetDialog({ presetName, onDelete }: { presetName: string; onDelete: () => void }) {
  const t = useTranslations('testingPresets');
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="destructive" size="icon-xs" title={t('deletePreset')}>
            <Trash2 className="size-3" />
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteDescription', { name: presetName })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDelete}>
            {t('delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface PresetItemProps {
  preset: ContextPreset;
  contextKeys: string[];
  isDefault: boolean;
  onDelete: () => void;
  onUpdate: (id: string, updates: Partial<ContextPreset>) => void;
}

function PresetItem({ preset, contextKeys, isDefault, onDelete, onUpdate }: PresetItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-md border px-3 py-2">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <ChevronDown className={`size-3 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          {preset.name}
        </span>
        {!isDefault && (
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <DeletePresetDialog presetName={preset.name} onDelete={onDelete} />
          </div>
        )}
      </div>
      {expanded && <PresetFields preset={preset} contextKeys={contextKeys} onUpdate={onUpdate} />}
    </li>
  );
}

export function TestingPresetsSection(props: TestingPresetsSectionProps) {
  const t = useTranslations('testingPresets');

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <Label>{t('sectionTitle')}</Label>
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
    </div>
  );
}
