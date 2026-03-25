'use client';

import { AuthCard } from '@/app/components/auth/AuthCard';
import { OAuthButtons } from '@/app/components/auth/OAuthButtons';
import { createClient } from '@/app/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginFieldsProps {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}

function LoginFields({ email, password, onEmailChange, onPasswordChange }: LoginFieldsProps) {
  const t = useTranslations('auth.login');

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="email">{t('email')}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder={t('emailPlaceholder')}
          required
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t('password')}</Label>
          <Link href="/forgot-password" className="text-primary -mt-0.5 text-xs underline">
            {t('forgotPassword')}
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          required
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
        />
      </div>
    </>
  );
}

function useLoginSubmit(email: string, password: string) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(t('errors.invalidCredentials'));
      setIsShaking(true);
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return { error, loading, isShaking, setIsShaking, handleSubmit };
}

function LoginForm() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { error, loading, isShaking, setIsShaking, handleSubmit } = useLoginSubmit(email, password);
  const isFormValid = EMAIL_REGEX.test(email) && password.length > 0;

  return (
    <>
      <OAuthButtons />
      <div className="flex items-center gap-2">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">{t('login.or')}</span>
        <Separator className="flex-1" />
      </div>
      <form
        onSubmit={handleSubmit}
        className={`flex flex-col gap-3 ${isShaking ? 'auth-shake' : ''}`}
        onAnimationEnd={() => setIsShaking(false)}
      >
        <LoginFields email={email} password={password} onEmailChange={setEmail} onPasswordChange={setPassword} />
        {error && <p className="text-destructive text-xs">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={!isFormValid || loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : t('login.submit')}
        </Button>
      </form>
      <p className="text-center text-xs text-muted-foreground">
        {t('login.noAccount')}{' '}
        <Link href="/signup" className="text-primary underline">
          {t('login.signUpLink')}
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  const t = useTranslations('auth');

  return (
    <AuthCard title={t('login.title')} description={t('login.description')}>
      <LoginForm />
    </AuthCard>
  );
}
