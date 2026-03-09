import { useCallback, useState } from 'react';

import { saveStagingKeyIdAction } from '../actions/agents';

interface UseApiKeySelectionParams {
  agentId: string | undefined;
  initialStagingKeyId: string | null;
  initialProductionKeyId: string | null;
}

export interface ApiKeySelectionState {
  stagingKeyId: string | null;
  productionKeyId: string | null;
  setProductionKeyId: React.Dispatch<React.SetStateAction<string | null>>;
  handleStagingKeyChange: (keyId: string | null) => void;
}

export function useApiKeySelection(params: UseApiKeySelectionParams): ApiKeySelectionState {
  const { agentId, initialStagingKeyId, initialProductionKeyId } = params;

  const [stagingKeyId, setStagingKeyId] = useState<string | null>(initialStagingKeyId);
  const [productionKeyId, setProductionKeyId] = useState<string | null>(initialProductionKeyId);

  const handleStagingKeyChange = useCallback(
    (keyId: string | null) => {
      setStagingKeyId(keyId);
      if (agentId !== undefined) {
        void saveStagingKeyIdAction(agentId, keyId);
      }
    },
    [agentId]
  );

  return { stagingKeyId, productionKeyId, setProductionKeyId, handleStagingKeyChange };
}
