'use client';

import { useCallback, useState } from 'react';

import type { AgentConfigData } from './useGraphLoader';

interface UseAgentEditorHooksParams {
  initialConfig: AgentConfigData | undefined;
}

interface UseAgentEditorHooksReturn {
  agentConfig: AgentConfigData | undefined;
  setAgentConfig: (config: AgentConfigData) => void;
  importCounter: number;
  getCurrentContextItems: () => Array<{ sortOrder: number; content: string }>;
}

export function useAgentEditorHooks({
  initialConfig,
}: UseAgentEditorHooksParams): UseAgentEditorHooksReturn {
  const [agentConfig, setAgentConfigInternal] = useState(initialConfig);
  const [importCounter, setImportCounter] = useState(0);

  const setAgentConfig = useCallback((config: AgentConfigData) => {
    setAgentConfigInternal(config);
    setImportCounter((prev) => prev + 1);
  }, []);

  const getCurrentContextItems = useCallback(
    () => agentConfig?.contextItems ?? [],
    [agentConfig]
  );

  return { agentConfig, setAgentConfig, importCounter, getCurrentContextItems };
}
