'use client';

import { AuthCard } from '@/app/components/auth/AuthCard';
import { OAuthButtons } from '@/app/components/auth/OAuthButtons';
import { createClient } from '@/app/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

function SignupFields() {
  const t = useTranslations('auth.signup');

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="name">{t('name')}</Label>
        <Input id="name" name="name" placeholder={t('namePlaceholder')} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="email">{t('email')}</Label>
        <Input id="email" name="email" type="email" placeholder={t('emailPlaceholder')} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="password">{t('password')}</Label>
        <Input id="password" name="password" type="password" required />
      </div>
    </>
  );
}

function SignupForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });

    if (authError) {
      setError(t('errors.generic'));
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <>
      <OAuthButtons />
      <div className="flex items-center gap-2">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">{t('signup.or')}</span>
        <Separator className="flex-1" />
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <SignupFields />
        {error && <p className="text-destructive text-xs">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {t('signup.submit')}
        </Button>
      </form>
      <p className="text-center text-xs text-muted-foreground">
        {t('signup.hasAccount')}{' '}
        <Link href="/login" className="text-primary underline">
          {t('signup.signInLink')}
        </Link>
      </p>
    </>
  );
}

export default function SignupPage() {
  const t = useTranslations('auth');

  return (
    <AuthCard title={t('signup.title')} description={t('signup.description')}>
      <SignupForm />
    </AuthCard>
  );
}
