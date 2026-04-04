'use client';

import { useCallback, useEffect, useState } from 'react';

/** Data extracted from the WA_EMBEDDED_SIGNUP message event. */
export interface EmbeddedSignupData {
  phoneNumberId: string;
  wabaId: string;
}

interface EmbeddedSignupState {
  data: EmbeddedSignupData | null;
  error: string | null;
}

interface ParsedSignupEvent {
  type: string;
  event: string;
  data: { phone_number_id?: string; waba_id?: string; error_message?: string };
}

const FINISH_EVENTS = new Set(['FINISH', 'FINISH_ONLY_WABA', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING']);

function isSignupEvent(parsed: ParsedSignupEvent): boolean {
  return parsed.type === 'WA_EMBEDDED_SIGNUP';
}

/**
 * Listens for the `WA_EMBEDDED_SIGNUP` postMessage from the Facebook
 * embedded-signup popup and extracts phone_number_id + waba_id.
 */
export function useEmbeddedSignup(): EmbeddedSignupState & { reset: () => void } {
  const [state, setState] = useState<EmbeddedSignupState>({ data: null, error: null });

  const reset = useCallback(() => {
    setState({ data: null, error: null });
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent<unknown>) => {
      if (typeof event.origin !== 'string') return;
      if (!event.origin.endsWith('facebook.com')) return;

      try {
        const raw = typeof event.data === 'string' ? event.data : '';
        const parsed: ParsedSignupEvent = JSON.parse(raw);

        if (!isSignupEvent(parsed)) return;

        if (FINISH_EVENTS.has(parsed.event)) {
          const phoneNumberId = parsed.data.phone_number_id ?? '';
          const wabaId = parsed.data.waba_id ?? '';
          if (phoneNumberId === '' || wabaId === '') {
            setState({ data: null, error: 'WhatsApp setup completed but phone number or WABA ID is missing' });
          } else {
            setState({ data: { phoneNumberId, wabaId }, error: null });
          }
        } else if (parsed.event === 'CANCEL') {
          setState({ data: null, error: 'WhatsApp setup was cancelled' });
        } else if (parsed.event === 'ERROR') {
          const msg = parsed.data.error_message ?? 'An error occurred during WhatsApp setup';
          setState({ data: null, error: msg });
        }
      } catch {
        // Non-JSON message from Facebook — ignore
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return { ...state, reset };
}
