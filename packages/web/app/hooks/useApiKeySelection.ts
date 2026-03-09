import { useCallback, useMemo, useState } from 'react';

import type { ApiKeyRow } from '../lib/api-keys';
import { saveStagingKeyId } from '../lib/agents';
import { createClient } from '../lib/supabase/client';

interface UseApiKeySelectionParams {
  agentId: string | undefined;
  orgApiKeys: ApiKeyRow[];
  initialStagingKeyId: string | null;
  initialProductionKeyId: string | null;
}

export interface ApiKeySelectionState {
  stagingKeyId: string | null;
  productionKeyId: string | null;
  setProductionKeyId: React.Dispatch<React.SetStateAction<string | null>>;
  resolvedApiKey: string;
  handleStagingKeyChange: (keyId: string | null) => void;
}

export function useApiKeySelection(params: UseApiKeySelectionParams): ApiKeySelectionState {
  const { agentId, orgApiKeys, initialStagingKeyId, initialProductionKeyId } = params;

  const [stagingKeyId, setStagingKeyId] = useState<string | null>(initialStagingKeyId);
  const [productionKeyId, setProductionKeyId] = useState<string | null>(initialProductionKeyId);

  const resolvedApiKey = useMemo(() => {
    if (stagingKeyId === null) return '';
    const found = orgApiKeys.find((k) => k.id === stagingKeyId);
    return found?.key_value ?? '';
  }, [stagingKeyId, orgApiKeys]);

  const handleStagingKeyChange = useCallback(
    (keyId: string | null) => {
      setStagingKeyId(keyId);
      if (agentId !== undefined) {
        const supabase = createClient();
        void saveStagingKeyId(supabase, agentId, keyId);
      }
    },
    [agentId]
  );

  return { stagingKeyId, productionKeyId, setProductionKeyId, resolvedApiKey, handleStagingKeyChange };
}
