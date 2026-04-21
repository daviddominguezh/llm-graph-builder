'use client';

import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const OTP_LENGTH = 6;
const MS_PER_SEC = 1000;
const SECS_PER_MIN = 60;

export interface OtpStepProps {
  phone: string;
  cooldownUntil: string | null;
  onEdit: () => void;
  onNewCooldown: (cooldownUntil: string | null) => void;
}

function formatCountdown(secondsLeft: number): string {
  const mins = Math.floor(secondsLeft / SECS_PER_MIN);
  const secs = secondsLeft % SECS_PER_MIN;
  const paddedSecs = String(secs).padStart(2, '0');
  return `${String(mins)}:${paddedSecs}`;
}

function computeSecondsLeft(cooldownUntil: string | null): number {
  if (cooldownUntil === null) {
    return 0;
  }
  return Math.max(0, Math.ceil((new Date(cooldownUntil).getTime() - Date.now()) / MS_PER_SEC));
}

function useCountdown(cooldownUntil: string | null): number {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (cooldownUntil === null) {
      return;
    }
    const id = setInterval(() => {
      setTick((t) => t + 1);
    }, MS_PER_SEC);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  return computeSecondsLeft(cooldownUntil);
}

interface VerifyOtpResponse {
  success: boolean;
}

async function verifyOtp(phone: string, token: string): Promise<{ ok: boolean; tooMany: boolean }> {
  const res = await fetch('/api/auth/phone/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, token }),
  });
  const body = (await res.json()) as VerifyOtpResponse;
  return { ok: res.ok && body.success === true, tooMany: res.status === 429 };
}

interface SendOtpResponse {
  cooldownUntil: string | null;
}

async function resendOtp(phone: string): Promise<SendOtpResponse> {
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

function useOtpVerify(phone: string) {
  const t = useTranslations('auth.verifyPhone');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleComplete(token: string) {
    setLoading(true);
    setError('');
    const result = await verifyOtp(phone, token);
    if (result.ok) {
      router.refresh();
      return;
    }
    setError(result.tooMany ? t('errors.tooManyAttempts') : t('errors.invalidOtp'));
    setLoading(false);
  }

  return { loading, error, handleComplete };
}

function useResend(phone: string, onNewCooldown: OtpStepProps['onNewCooldown']) {
  const t = useTranslations('auth.verifyPhone');
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState('');

  async function handleResend() {
    setResending(true);
    setResendError('');
    try {
      const { cooldownUntil } = await resendOtp(phone);
      onNewCooldown(cooldownUntil);
    } catch {
      setResendError(t('errors.sendFailed'));
    } finally {
      setResending(false);
    }
  }

  return { resending, resendError, handleResend };
}

function OtpResend({
  secondsLeft,
  resending,
  resendError,
  onResend,
}: {
  secondsLeft: number;
  resending: boolean;
  resendError: string;
  onResend: () => void;
}) {
  const t = useTranslations('auth.verifyPhone');
  const canResend = secondsLeft === 0 && !resending;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className="text-primary text-xs underline disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canResend}
        onClick={onResend}
      >
        {secondsLeft > 0 ? t('resendIn', { time: formatCountdown(secondsLeft) }) : t('resend')}
      </button>
      {resendError.length > 0 && <p className="text-destructive text-xs">{resendError}</p>}
    </div>
  );
}

export function OtpStep({ phone, cooldownUntil, onEdit, onNewCooldown }: OtpStepProps) {
  const t = useTranslations('auth.verifyPhone');
  const [otp, setOtp] = useState('');
  const secondsLeft = useCountdown(cooldownUntil);
  const { loading, error, handleComplete } = useOtpVerify(phone);
  const { resending, resendError, handleResend } = useResend(phone, onNewCooldown);

  function handleChange(value: string) {
    setOtp(value);
    if (value.length === OTP_LENGTH) {
      handleComplete(value).catch(() => {
        setOtp('');
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        {t('otpDescription')} <span className="font-medium text-foreground">{phone}</span>
      </p>
      <div className="flex justify-center">
        <InputOTP maxLength={OTP_LENGTH} value={otp} onChange={handleChange} disabled={loading}>
          <InputOTPGroup>
            {Array.from({ length: OTP_LENGTH }, (_, i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>
      {error.length > 0 && <p className="text-destructive text-center text-xs">{error}</p>}
      <OtpResend secondsLeft={secondsLeft} resending={resending} resendError={resendError} onResend={handleResend} />
      <p className="text-muted-foreground text-xs">
        {t('editPhone')}{' '}
        <button type="button" className="text-primary underline" onClick={onEdit}>
          Edit
        </button>
      </p>
    </div>
  );
}
