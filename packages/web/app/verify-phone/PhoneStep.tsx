'use client';

import { ALLOWED_COUNTRIES, detectCountry } from '@/app/lib/auth/detectCountry';
import { formatCountdown, useCountdown } from '@/app/lib/auth/useCountdown';
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

function noopUnsubscribe(): void {
  // nothing to unsubscribe — detection is a one-shot
}

function subscribeToNothing(): () => void {
  return noopUnsubscribe;
}

function getServerCountry(): Country | null {
  return null;
}

function useDetectedCountry(): Country | null {
  return useSyncExternalStore(subscribeToNothing, detectCountry, getServerCountry);
}

interface CheckResponse {
  available: boolean;
}

interface SendOtpBody {
  ok?: boolean;
  error?: string;
  cooldownUntil?: string | null;
}

type SendOtpResult =
  | { kind: 'ok'; cooldownUntil: string | null }
  | { kind: 'cooldown'; cooldownUntil: string }
  | { kind: 'rate_limited_24h' }
  | { kind: 'ip_rate_limited' }
  | { kind: 'phone_taken' }
  | { kind: 'error'; code: string };

async function checkPhone(phone: string): Promise<CheckResponse> {
  const res = await fetch('/api/auth/phone/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  return res.json() as Promise<CheckResponse>;
}

async function sendOtp(phone: string): Promise<SendOtpResult> {
  const res = await fetch('/api/auth/phone/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const body = (await res.json()) as SendOtpBody;
  if (res.ok) return { kind: 'ok', cooldownUntil: body.cooldownUntil ?? null };
  if (body.error === 'cooldown' && typeof body.cooldownUntil === 'string') {
    return { kind: 'cooldown', cooldownUntil: body.cooldownUntil };
  }
  if (body.error === 'otp_rate_limited_24h') return { kind: 'rate_limited_24h' };
  if (body.error === 'rate_limited') return { kind: 'ip_rate_limited' };
  if (body.error === 'phone_taken') return { kind: 'phone_taken' };
  return { kind: 'error', code: body.error ?? 'send_failed' };
}

interface PhoneSubmitState {
  loading: boolean;
  error: string;
  cooldownUntil: string | null;
}

function handleSendResult(
  result: SendOtpResult,
  setState: (partial: Partial<PhoneSubmitState>) => void,
  onAdvance: PhoneStepProps['onAdvance'],
  t: (key: string) => string
): void {
  if (result.kind === 'ok') {
    onAdvance(result.cooldownUntil);
    return;
  }
  if (result.kind === 'cooldown') {
    setState({ cooldownUntil: result.cooldownUntil, loading: false });
    return;
  }
  if (result.kind === 'rate_limited_24h') {
    setState({ error: t('errors.rateLimited24h'), loading: false });
    return;
  }
  if (result.kind === 'ip_rate_limited') {
    setState({ error: t('errors.ipRateLimited'), loading: false });
    return;
  }
  if (result.kind === 'phone_taken') {
    setState({ error: t('errors.phoneTaken'), loading: false });
    return;
  }
  setState({ error: t('errors.sendFailed'), loading: false });
}

function usePhoneSubmit(phone: string, onAdvance: PhoneStepProps['onAdvance']) {
  const t = useTranslations('auth.verifyPhone');
  const [state, setStateRaw] = useState<PhoneSubmitState>({ loading: false, error: '', cooldownUntil: null });

  function setState(partial: Partial<PhoneSubmitState>): void {
    setStateRaw((s) => ({ ...s, ...partial }));
  }

  async function handleSubmit() {
    setState({ loading: true, error: '', cooldownUntil: null });
    try {
      const check = await checkPhone(phone);
      if (check.available === false) {
        setState({ error: t('errors.phoneTaken'), loading: false });
        return;
      }
      const result = await sendOtp(phone);
      handleSendResult(result, setState, onAdvance, t);
    } catch {
      setState({ error: t('errors.sendFailed'), loading: false });
    }
  }

  return { ...state, handleSubmit };
}

export function PhoneStep({ phone, onPhoneChange, onAdvance }: PhoneStepProps) {
  const t = useTranslations('auth.verifyPhone');
  const { loading, error, cooldownUntil, handleSubmit } = usePhoneSubmit(phone, onAdvance);
  const defaultCountry = useDetectedCountry();
  const secondsLeft = useCountdown(cooldownUntil);
  const isCoolingDown = secondsLeft > 0;
  const isDisabled = loading || isCoolingDown || phone.length === 0;

  function handleChange(value: PhoneValue) {
    onPhoneChange(value ?? '');
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label>{t('phoneLabel')}</Label>
        {defaultCountry === null ? (
          <div className="flex h-7 overflow-hidden rounded-full" aria-hidden>
            <div className="w-full animate-pulse rounded-s-lg bg-input" />
          </div>
        ) : (
          <PhoneInput
            key={defaultCountry}
            value={phone as PhoneValue}
            onChange={handleChange}
            disabled={loading || isCoolingDown}
            defaultCountry={defaultCountry}
            countries={[...ALLOWED_COUNTRIES]}
            addInternationalOption={false}
          />
        )}
      </div>
      {error.length > 0 && <p className="text-destructive text-xs">{error}</p>}
      {isCoolingDown && (
        <p className="text-muted-foreground text-xs">
          {t('cooldown', { time: formatCountdown(secondsLeft) })}
        </p>
      )}
      <Button type="button" size="lg" className="w-full mt-0" disabled={isDisabled} onClick={handleSubmit}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : t('continue')}
      </Button>
    </div>
  );
}
