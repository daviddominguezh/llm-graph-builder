import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { saveProductionKeyIdAction, saveStagingKeyIdAction } from '../actions/agents';

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
  handleProductionKeyChange: (keyId: string | null) => Promise<void>;
}

export function useApiKeySelection(params: UseApiKeySelectionParams): ApiKeySelectionState {
  const { agentId, initialStagingKeyId, initialProductionKeyId } = params;

  const [stagingKeyId, setStagingKeyId] = useState<string | null>(initialStagingKeyId);
  const [productionKeyId, setProductionKeyId] = useState<string | null>(initialProductionKeyId);
  const lastSavedStagingRef = useRef(initialStagingKeyId);
  const lastSavedProductionRef = useRef(initialProductionKeyId);

  const handleStagingKeyChange = useCallback(
    async (keyId: string | null) => {
      setStagingKeyId(keyId);
      if (agentId !== undefined) {
        const { error } = await saveStagingKeyIdAction(agentId, keyId);
        if (error === null) {
          lastSavedStagingRef.current = keyId;
        } else {
          setStagingKeyId(lastSavedStagingRef.current);
          toast.error(error);
        }
      }
    },
    [agentId]
  );

  const handleProductionKeyChange = useCallback(
    async (keyId: string | null) => {
      setProductionKeyId(keyId);
      if (agentId !== undefined) {
        const { error } = await saveProductionKeyIdAction(agentId, keyId);
        if (error === null) {
          lastSavedProductionRef.current = keyId;
        } else {
          setProductionKeyId(lastSavedProductionRef.current);
          toast.error(error);
        }
      }
    },
    [agentId]
  );

  return {
    stagingKeyId,
    productionKeyId,
    setProductionKeyId,
    handleStagingKeyChange,
    handleProductionKeyChange,
  };
}
