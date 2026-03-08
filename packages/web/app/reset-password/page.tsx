'use client';

import { AuthCard } from '@/app/components/auth/AuthCard';
import { createClient } from '@/app/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';

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

function ResetPasswordForm() {
  const t = useTranslations('auth');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
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

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-center text-sm text-muted-foreground">{t('resetPassword.success')}</p>
        <Link href="/" className="text-primary text-sm underline">
          {t('login.submit')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <ResetPasswordFields />
      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {t('resetPassword.submit')}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations('auth');

  return (
    <AuthCard title={t('resetPassword.title')} description={t('resetPassword.description')}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
