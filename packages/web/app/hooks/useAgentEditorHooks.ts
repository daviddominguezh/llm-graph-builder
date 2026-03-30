'use client';

import { useCallback, useState } from 'react';

import type { AgentConfigData } from './useGraphLoader';

const INITIAL_COUNTER = 0;
const INCREMENT = 1;

interface UseAgentEditorHooksParams {
  initialConfig: AgentConfigData | undefined;
}

interface UseAgentEditorHooksReturn {
  agentConfig: AgentConfigData | undefined;
  setAgentConfig: (config: AgentConfigData) => void;
  importCounter: number;
  getCurrentContextItems: () => Array<{ sortOrder: number; content: string }>;
}

export function useAgentEditorHooks({ initialConfig }: UseAgentEditorHooksParams): UseAgentEditorHooksReturn {
  const [agentConfig, setAgentConfigInternal] = useState(initialConfig);
  const [importCounter, setImportCounter] = useState(INITIAL_COUNTER);

  const setAgentConfig = useCallback((config: AgentConfigData) => {
    setAgentConfigInternal(config);
    setImportCounter((prev) => prev + INCREMENT);
  }, []);

  const getCurrentContextItems = useCallback(() => agentConfig?.contextItems ?? [], [agentConfig]);

  return { agentConfig, setAgentConfig, importCounter, getCurrentContextItems };
}
