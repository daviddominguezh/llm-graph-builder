'use client';

import { AuthCard } from '@/app/components/auth/AuthCard';
import { OAuthButtons } from '@/app/components/auth/OAuthButtons';
import { enterToSubmit } from '@/app/lib/auth/enterToSubmit';
import { createClient } from '@/app/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ExistsResult {
  exists: boolean;
  providers: string[];
}

function isExistsResult(value: unknown): value is ExistsResult {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj['exists'] === 'boolean' && Array.isArray(obj['providers']);
}

async function fetchEmailLookup(email: string): Promise<ExistsResult | null> {
  const res = await fetch('/api/auth/public/lookup-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) return null;
  const data: unknown = await res.json();
  return isExistsResult(data) ? data : null;
}

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

interface UseLoginSubmitOptions {
  setError: (msg: string) => void;
  setIsShaking: (v: boolean) => void;
  setLoading: (v: boolean) => void;
}

async function checkEmailProvider(email: string, t: (key: string) => string, opts: UseLoginSubmitOptions): Promise<boolean> {
  const lookup = await fetchEmailLookup(email);
  if (lookup === null) return false;
  if (lookup.exists && lookup.providers.length === 1 && lookup.providers[0] === 'google') {
    opts.setError(t('login.errors.emailUsesGoogle'));
    opts.setIsShaking(true);
    opts.setLoading(false);
    return true;
  }
  return false;
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

    const opts: UseLoginSubmitOptions = { setError, setIsShaking, setLoading };
    const shouldAbort = await checkEmailProvider(email, t, opts);
    if (shouldAbort) return;

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError !== null) {
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

function OAuthDuplicateBanner({ email }: { email: string }) {
  const t = useTranslations('auth');
  const forgotHref = `/forgot-password?email=${encodeURIComponent(email)}`;

  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs">
      <p>{t('login.errors.oauthDuplicate', { email })}</p>
      <Link href={forgotHref} className="text-primary underline">
        {t('login.errors.oauthDuplicateForgotPassword')}
      </Link>
    </div>
  );
}

function LoginForm() {
  const t = useTranslations('auth');
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { error, loading, isShaking, setIsShaking, handleSubmit } = useLoginSubmit(email, password);
  const isFormValid = EMAIL_REGEX.test(email) && password.length > 0;

  const oauthErrorEmail = searchParams.get('error') === 'oauth_duplicate' ? searchParams.get('email') : null;

  return (
    <>
      {oauthErrorEmail !== null && <OAuthDuplicateBanner email={oauthErrorEmail} />}
      <OAuthButtons />
      <div className="flex items-center gap-2">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">{t('login.or')}</span>
        <Separator className="flex-1" />
      </div>
      <form
        onSubmit={handleSubmit}
        onKeyDown={enterToSubmit}
        className={`flex flex-col gap-3 ${isShaking ? 'auth-shake' : ''}`}
        onAnimationEnd={() => setIsShaking(false)}
      >
        <LoginFields email={email} password={password} onEmailChange={setEmail} onPasswordChange={setPassword} />
        {error.length > 0 && <p className="text-destructive text-xs">{error}</p>}
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
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
