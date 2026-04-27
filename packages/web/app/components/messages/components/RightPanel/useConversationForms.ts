'use client';

import { getConversationFormDataAction, getFormDefinitionsAction } from '@/app/actions/forms';
import type { FailedAttempt, FormData, FormDefinition } from '@daviddh/llm-graph-runner';
import { useEffect, useState } from 'react';

interface State {
  forms: FormDefinition[];
  formData: Record<string, FormData>;
  diagnostics: Record<string, { lastFailures: FailedAttempt[] }>;
}

const EMPTY: State = { forms: [], formData: {}, diagnostics: {} };

export function useConversationForms(agentId: string | null, conversationId: string | null): State {
  const [state, setState] = useState<State>(EMPTY);
  useEffect(() => {
    if (agentId === null || conversationId === null) return undefined;
    let cancelled = false;
    Promise.all([getFormDefinitionsAction(agentId), getConversationFormDataAction(conversationId)])
      .then(([forms, fd]) => {
        if (cancelled) return;
        setState({ forms, formData: fd.formData, diagnostics: fd.diagnostics });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [agentId, conversationId]);
  if (agentId === null || conversationId === null) return EMPTY;
  return state;
}
