import type { Operation } from '@daviddh/graph-types';
import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';

import { type ContextPreset, DEFAULT_PRESET } from '../types/preset';
import type { PushOperation } from '../utils/operationBuilders';

const FIRST_INDEX = 0;
const NAME_SUFFIX_LENGTH = 4;

interface PresetsState {
  presets: ContextPreset[];
  activePreset: ContextPreset | undefined;
  activePresetId: string;
  contextKeys: string[];
  setActivePresetId: (id: string) => void;
  addPreset: () => void;
  deletePreset: (id: string) => void;
  updatePreset: (id: string, updates: Partial<ContextPreset>) => void;
  addContextKey: (key: string) => void;
  removeContextKey: (key: string) => void;
  renameContextKey: (oldKey: string, newKey: string) => void;
  setContextKeys: (keys: string[]) => void;
}

interface PresetOpData {
  name: string;
  sessionId?: string;
  tenantId?: string;
  userId?: string;
  data?: Record<string, unknown>;
}

function toPresetOpData(preset: ContextPreset): PresetOpData {
  return {
    name: preset.name,
    sessionId: preset.sessionID,
    tenantId: preset.tenantID,
    userId: preset.userID,
    data: preset.data,
  };
}

function buildInsertPresetOp(preset: ContextPreset): Operation {
  return { type: 'insertContextPreset', data: toPresetOpData(preset) };
}

function buildUpdatePresetOp(preset: ContextPreset): Operation {
  return { type: 'updateContextPreset', data: toPresetOpData(preset) };
}

function buildDeletePresetOp(name: string): Operation {
  return { type: 'deleteContextPreset', name };
}

function useDeletePreset(
  setPresets: React.Dispatch<React.SetStateAction<ContextPreset[]>>,
  setActivePresetId: React.Dispatch<React.SetStateAction<string>>,
  pushOperation: PushOperation
): (id: string) => void {
  return useCallback(
    (id: string) => {
      setPresets((prev) => {
        const target = prev.find((p) => p.id === id);
        const filtered = prev.filter((p) => p.id !== id);
        const next = filtered.length === FIRST_INDEX ? [DEFAULT_PRESET] : filtered;
        setActivePresetId((currentId) =>
          currentId === id ? (next[FIRST_INDEX]?.id ?? DEFAULT_PRESET.id) : currentId
        );
        if (target !== undefined) pushOperation(buildDeletePresetOp(target.name));
        return next;
      });
    },
    [setPresets, setActivePresetId, pushOperation]
  );
}

function removeKeyFromData(data: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([k]) => k !== key));
}

function renameKeyInData(
  data: Record<string, unknown>,
  oldKey: string,
  newKey: string
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => (k === oldKey ? [newKey, v] : [k, v])));
}

function useContextKeys(setPresets: React.Dispatch<React.SetStateAction<ContextPreset[]>>): {
  contextKeys: string[];
  addContextKey: (key: string) => void;
  removeContextKey: (key: string) => void;
  renameContextKey: (oldKey: string, newKey: string) => void;
  setContextKeys: (keys: string[]) => void;
} {
  const [contextKeys, setContextKeys] = useState<string[]>([]);

  const addContextKey = useCallback(
    (key: string) => {
      setContextKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
      setPresets((prev) => prev.map((p) => ({ ...p, data: { ...p.data, [key]: '' } })));
    },
    [setPresets]
  );

  const removeContextKey = useCallback(
    (key: string) => {
      setContextKeys((prev) => prev.filter((k) => k !== key));
      setPresets((prev) => prev.map((p) => ({ ...p, data: removeKeyFromData(p.data, key) })));
    },
    [setPresets]
  );

  const renameContextKey = useCallback(
    (oldKey: string, newKey: string) => {
      setContextKeys((prev) => prev.map((k) => (k === oldKey ? newKey : k)));
      setPresets((prev) => prev.map((p) => ({ ...p, data: renameKeyInData(p.data, oldKey, newKey) })));
    },
    [setPresets]
  );

  return { contextKeys, addContextKey, removeContextKey, renameContextKey, setContextKeys };
}

function usePresetCrud(
  setPresets: React.Dispatch<React.SetStateAction<ContextPreset[]>>,
  pushOperation: PushOperation
): {
  addPreset: () => void;
  deletePreset: (id: string) => void;
  updatePreset: (id: string, updates: Partial<ContextPreset>) => void;
  setActivePresetId: React.Dispatch<React.SetStateAction<string>>;
  activePresetId: string;
} {
  const [activePresetId, setActivePresetId] = useState(DEFAULT_PRESET.id);

  const addPreset = useCallback(() => {
    const id = nanoid();
    const newPreset: ContextPreset = {
      ...DEFAULT_PRESET,
      id,
      name: `Preset ${id.slice(FIRST_INDEX, NAME_SUFFIX_LENGTH)}`,
    };
    setPresets((prev) => [...prev, newPreset]);
    pushOperation(buildInsertPresetOp(newPreset));
    setActivePresetId(id);
  }, [setPresets, pushOperation]);

  const deletePreset = useDeletePreset(setPresets, setActivePresetId, pushOperation);

  const updatePreset = useCallback(
    (id: string, updates: Partial<ContextPreset>) => {
      setPresets((prev) => {
        const updated = prev.map((p) => (p.id === id ? { ...p, ...updates } : p));
        const merged = updated.find((p) => p.id === id);
        if (merged !== undefined) pushOperation(buildUpdatePresetOp(merged));
        return updated;
      });
    },
    [setPresets, pushOperation]
  );

  return { addPreset, deletePreset, updatePreset, setActivePresetId, activePresetId };
}

export function usePresets(pushOperation: PushOperation): PresetsState {
  const [presets, setPresets] = useState<ContextPreset[]>([DEFAULT_PRESET]);
  const crud = usePresetCrud(setPresets, pushOperation);
  const ctx = useContextKeys(setPresets);

  const activePreset = presets.find((p) => p.id === crud.activePresetId) ?? presets[FIRST_INDEX];

  return {
    presets,
    activePreset,
    contextKeys: ctx.contextKeys,
    activePresetId: crud.activePresetId,
    setActivePresetId: crud.setActivePresetId,
    addPreset: crud.addPreset,
    deletePreset: crud.deletePreset,
    updatePreset: crud.updatePreset,
    addContextKey: ctx.addContextKey,
    removeContextKey: ctx.removeContextKey,
    renameContextKey: ctx.renameContextKey,
    setContextKeys: ctx.setContextKeys,
  };
}
