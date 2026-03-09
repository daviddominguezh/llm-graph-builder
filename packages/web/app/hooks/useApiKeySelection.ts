import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

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
  handleStagingKeyChange: (keyId: string | null) => Promise<void>;
}

export function useApiKeySelection(params: UseApiKeySelectionParams): ApiKeySelectionState {
  const { agentId, initialStagingKeyId, initialProductionKeyId } = params;

  const [stagingKeyId, setStagingKeyId] = useState<string | null>(initialStagingKeyId);
  const [productionKeyId, setProductionKeyId] = useState<string | null>(initialProductionKeyId);
  const lastSavedKeyIdRef = useRef(initialStagingKeyId);

  const handleStagingKeyChange = useCallback(
    async (keyId: string | null) => {
      setStagingKeyId(keyId);
      if (agentId !== undefined) {
        const { error } = await saveStagingKeyIdAction(agentId, keyId);
        if (error === null) {
          lastSavedKeyIdRef.current = keyId;
        } else {
          setStagingKeyId(lastSavedKeyIdRef.current);
          toast.error(error);
        }
      }
    },
    [agentId]
  );

  return { stagingKeyId, productionKeyId, setProductionKeyId, handleStagingKeyChange };
}
