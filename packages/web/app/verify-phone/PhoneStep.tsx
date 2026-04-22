'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import type { Country, Value as PhoneValue } from 'react-phone-number-input';

export interface PhoneStepProps {
  phone: string;
  onPhoneChange: (value: string) => void;
  onAdvance: (cooldownUntil: string | null) => void;
}

const ALLOWED_COUNTRIES: readonly Country[] = ['US', 'CA', 'GB', 'CO', 'AR', 'CL', 'MX', 'BR'];
const DEFAULT_COUNTRY: Country = 'US';

function detectCountry(): Country {
  if (typeof navigator === 'undefined') return DEFAULT_COUNTRY;
  const locales = [navigator.language, ...(navigator.languages ?? [])];
  for (const loc of locales) {
    try {
      const region = new Intl.Locale(loc).region;
      if (region !== undefined && (ALLOWED_COUNTRIES as readonly string[]).includes(region)) {
        return region as Country;
      }
    } catch {
      // malformed locale string — skip
    }
  }
  return DEFAULT_COUNTRY;
}

function noopUnsubscribe(): void {
  // nothing to unsubscribe — detection is a one-shot
}

function subscribeToNothing(): () => void {
  return noopUnsubscribe;
}

function getServerCountry(): Country {
  return DEFAULT_COUNTRY;
}

function useDetectedCountry(): Country {
  return useSyncExternalStore(subscribeToNothing, detectCountry, getServerCountry);
}

interface CheckResponse {
  available: boolean;
}

interface SendOtpResponse {
  cooldownUntil: string | null;
}

async function checkPhone(phone: string): Promise<CheckResponse> {
  const res = await fetch('/api/auth/phone/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  return res.json() as Promise<CheckResponse>;
}

async function sendOtp(phone: string): Promise<SendOtpResponse> {
  const res = await fetch('/api/auth/phone/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    throw new Error('send-failed');
  }
  return res.json() as Promise<SendOtpResponse>;
}

function usePhoneSubmit(phone: string, onAdvance: PhoneStepProps['onAdvance']) {
  const t = useTranslations('auth.verifyPhone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    setLoading(true);
    setError('');
    try {
      const check = await checkPhone(phone);
      if (check.available === false) {
        setError(t('errors.phoneTaken'));
        setLoading(false);
        return;
      }
      const { cooldownUntil } = await sendOtp(phone);
      onAdvance(cooldownUntil);
    } catch {
      setError(t('errors.sendFailed'));
    } finally {
      setLoading(false);
    }
  }

  return { loading, error, handleSubmit };
}

export function PhoneStep({ phone, onPhoneChange, onAdvance }: PhoneStepProps) {
  const t = useTranslations('auth.verifyPhone');
  const { loading, error, handleSubmit } = usePhoneSubmit(phone, onAdvance);
  const defaultCountry = useDetectedCountry();
  const isDisabled = loading || phone.length === 0;

  function handleChange(value: PhoneValue) {
    onPhoneChange(value ?? '');
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label>{t('phoneLabel')}</Label>
        <PhoneInput
          key={defaultCountry}
          value={phone as PhoneValue}
          onChange={handleChange}
          disabled={loading}
          defaultCountry={defaultCountry}
          countries={[...ALLOWED_COUNTRIES]}
          addInternationalOption={false}
        />
      </div>
      {error.length > 0 && <p className="text-destructive text-xs">{error}</p>}
      <Button type="button" size="lg" className="w-full" disabled={isDisabled} onClick={handleSubmit}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : t('continue')}
      </Button>
    </div>
  );
}
