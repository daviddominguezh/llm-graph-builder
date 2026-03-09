'use client';

import { AuthCard } from '@/app/components/auth/AuthCard';
import { createClient } from '@/app/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';

function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const supabase = createClient();

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (resetError) {
      setError(t('errors.generic'));
      setLoading(false);
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return <p className="text-center text-sm text-muted-foreground">{t('forgotPassword.checkEmail')}</p>;
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="email">{t('forgotPassword.email')}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder={t('forgotPassword.emailPlaceholder')}
            required
          />
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {t('forgotPassword.submit')}
        </Button>
      </form>
      <p className="text-center text-xs text-muted-foreground">
        <Link href="/login" className="text-primary underline">
          {t('forgotPassword.backToLogin')}
        </Link>
      </p>
    </>
  );
}

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');

  return (
    <AuthCard title={t('forgotPassword.title')} description={t('forgotPassword.description')}>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
