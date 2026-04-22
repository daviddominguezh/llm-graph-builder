'use client';

import { AuthCard } from '@/app/components/auth/AuthCard';
import { createClient } from '@/app/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';

const VERIFY_TIMEOUT_MS = 4000;

type ResetState = 'verifying' | 'ready' | 'invalid';

function useResetSession(): ResetState {
  const [state, setState] = useState<ResetState>('verifying');

  useEffect(() => {
    const supabase = createClient();
    let settled = false;
    const markReady = (): void => {
      if (settled) return;
      settled = true;
      setState('ready');
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session !== null) markReady();
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session !== null) markReady();
    });
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        setState('invalid');
      }
    }, VERIFY_TIMEOUT_MS);
    return () => {
      settled = true;
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  return state;
}

function ResetPasswordFields() {
  const t = useTranslations('auth.resetPassword');
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="password">{t('password')}</Label>
        <Input id="password" name="password" type="password" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" required />
      </div>
    </>
  );
}

function SuccessState() {
  const t = useTranslations('auth');
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-center text-sm text-muted-foreground">{t('resetPassword.success')}</p>
      <Link href="/" className="text-primary text-sm underline">
        {t('resetPassword.goToDashboard')}
      </Link>
    </div>
  );
}

function VerifyingState() {
  const t = useTranslations('auth');
  return (
    <p className="text-center text-sm text-muted-foreground" aria-live="polite">
      {t('resetPassword.verifying')}
    </p>
  );
}

function InvalidState() {
  const t = useTranslations('auth');
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-center text-sm text-destructive">{t('resetPassword.invalidLink')}</p>
      <Link href="/forgot-password" className="text-primary text-sm underline">
        {t('resetPassword.requestNew')}
      </Link>
    </div>
  );
}

function useResetSubmit(): {
  error: string;
  loading: boolean;
  success: boolean;
  submit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
} {
  const t = useTranslations('auth');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError('');
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    if (password !== confirmPassword) {
      setError(t('resetPassword.mismatch'));
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(t('errors.generic'));
      setLoading(false);
      return;
    }
    setSuccess(true);
  }

  return { error, loading, success, submit };
}

function ResetPasswordForm() {
  const t = useTranslations('auth');
  const { error, loading, success, submit } = useResetSubmit();

  if (success) return <SuccessState />;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <ResetPasswordFields />
      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {t('resetPassword.submit')}
      </Button>
    </form>
  );
}

function ResetPasswordBody() {
  const state = useResetSession();
  if (state === 'verifying') return <VerifyingState />;
  if (state === 'invalid') return <InvalidState />;
  return <ResetPasswordForm />;
}

export default function ResetPasswordPage() {
  const t = useTranslations('auth');

  return (
    <AuthCard title={t('resetPassword.title')} description={t('resetPassword.description')}>
      <ResetPasswordBody />
    </AuthCard>
  );
}
