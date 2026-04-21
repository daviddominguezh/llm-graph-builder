'use client';

import { useEffect, useRef } from 'react';

import { useOpenRouterModels } from '../hooks/useOpenRouterModels';

export function OpenRouterModelsLogger(): null {
  const models = useOpenRouterModels();
  const logged = useRef(false);

  useEffect(() => {
    if (models.length > 0 && !logged.current) {
      logged.current = true;
    }
  }, [models]);

  return null;
}
