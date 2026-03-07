import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';

import { type ContextPreset, DEFAULT_PRESET } from '../types/preset';

const FIRST_INDEX = 0;
const NAME_SUFFIX_LENGTH = 4;

const API_KEY_STORAGE_KEY = 'llm-graph-builder-api-key';

function loadApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(API_KEY_STORAGE_KEY) ?? '';
}

interface PresetsState {
  presets: ContextPreset[];
  activePreset: ContextPreset | undefined;
  activePresetId: string;
  apiKey: string;
  setActivePresetId: (id: string) => void;
  setApiKey: (key: string) => void;
  addPreset: () => void;
  deletePreset: (id: string) => void;
  updatePreset: (id: string, updates: Partial<ContextPreset>) => void;
}

function useDeletePreset(
  setPresets: React.Dispatch<React.SetStateAction<ContextPreset[]>>,
  setActivePresetId: React.Dispatch<React.SetStateAction<string>>
): (id: string) => void {
  return useCallback(
    (id: string) => {
      setPresets((prev) => {
        const filtered = prev.filter((p) => p.id !== id);
        const next = filtered.length === FIRST_INDEX ? [DEFAULT_PRESET] : filtered;
        setActivePresetId((currentId) =>
          currentId === id ? (next[FIRST_INDEX]?.id ?? DEFAULT_PRESET.id) : currentId
        );
        return next;
      });
    },
    [setPresets, setActivePresetId]
  );
}

export function usePresets(): PresetsState {
  const [presets, setPresets] = useState<ContextPreset[]>([DEFAULT_PRESET]);
  const [activePresetId, setActivePresetId] = useState(DEFAULT_PRESET.id);
  const [apiKey, setApiKeyState] = useState(loadApiKey);

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
  }, []);

  const activePreset = presets.find((p) => p.id === activePresetId) ?? presets[FIRST_INDEX];

  const addPreset = useCallback(() => {
    const id = nanoid();
    const newPreset: ContextPreset = {
      ...DEFAULT_PRESET,
      id,
      name: `Preset ${id.slice(FIRST_INDEX, NAME_SUFFIX_LENGTH)}`,
    };
    setPresets((prev) => [...prev, newPreset]);
    setActivePresetId(id);
  }, []);

  const deletePreset = useDeletePreset(setPresets, setActivePresetId);

  const updatePreset = useCallback((id: string, updates: Partial<ContextPreset>) => {
    setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  }, []);

  return {
    presets,
    activePreset,
    activePresetId,
    apiKey,
    setActivePresetId,
    setApiKey,
    addPreset,
    deletePreset,
    updatePreset,
  };
}
