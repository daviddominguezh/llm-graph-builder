'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { Value as PhoneValue } from 'react-phone-number-input';

export interface PhoneStepProps {
  phone: string;
  onPhoneChange: (value: string) => void;
  onAdvance: (cooldownUntil: string | null) => void;
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
  const isDisabled = loading || phone.length === 0;

  function handleChange(value: PhoneValue) {
    onPhoneChange(value ?? '');
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label>{t('phoneLabel')}</Label>
        <PhoneInput value={phone as PhoneValue} onChange={handleChange} disabled={loading} />
      </div>
      {error.length > 0 && <p className="text-destructive text-xs">{error}</p>}
      <Button type="button" size="lg" className="w-full" disabled={isDisabled} onClick={handleSubmit}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : t('continue')}
      </Button>
    </div>
  );
}
