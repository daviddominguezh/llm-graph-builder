'use client';

import type { Operation } from '@daviddh/graph-types';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { AgentConfigExportSchema } from '../schemas/agentConfig.schema';
import type { AgentConfigData } from './useGraphLoader';

const FIRST_FILE_INDEX = 0;

type PushOperation = (op: Operation) => void;

interface ContextItem {
  sortOrder: number;
  content: string;
}

interface UseAgentImportParams {
  pushOperation: PushOperation;
  setAgentConfig: (config: AgentConfigData) => void;
  getCurrentContextItems: () => ContextItem[];
}

function clearExistingContextItems(existingItems: ContextItem[], pushOperation: PushOperation): void {
  for (const item of existingItems) {
    pushOperation({ type: 'deleteContextItem', data: { sortOrder: item.sortOrder } });
  }
}

function buildContextItems(contents: string[]): ContextItem[] {
  return contents.map((content, i) => ({ sortOrder: i, content }));
}

function applyImportedConfig(
  data: ReturnType<typeof AgentConfigExportSchema.parse>,
  params: UseAgentImportParams
): void {
  const contextItems = buildContextItems(data.contextItems);
  const config: AgentConfigData = {
    systemPrompt: data.systemPrompt,
    maxSteps: data.maxSteps,
    contextItems,
    skills: [],
  };

  const existingItems = params.getCurrentContextItems();
  clearExistingContextItems(existingItems, params.pushOperation);

  params.setAgentConfig(config);
  params.pushOperation({
    type: 'updateAgentConfig',
    data: { systemPrompt: data.systemPrompt, maxSteps: data.maxSteps },
  });

  for (const item of contextItems) {
    params.pushOperation({
      type: 'insertContextItem',
      data: { sortOrder: item.sortOrder, content: item.content },
    });
  }
}

function parseAndApply(text: string, params: UseAgentImportParams): void {
  const json: unknown = JSON.parse(text);
  const result = AgentConfigExportSchema.safeParse(json);
  if (result.success) {
    applyImportedConfig(result.data, params);
  } else {
    toast.error(`Invalid agent config file: ${result.error.message}`);
  }
}

export function useAgentImport(params: UseAgentImportParams): () => void {
  const { pushOperation, setAgentConfig, getCurrentContextItems } = params;

  return useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[FIRST_FILE_INDEX];
      if (file === undefined) return;
      void file.text().then((text) => {
        try {
          parseAndApply(text, { pushOperation, setAgentConfig, getCurrentContextItems });
        } catch {
          toast.error('Failed to parse JSON file');
        }
      });
    };
    input.click();
  }, [pushOperation, setAgentConfig, getCurrentContextItems]);
}
