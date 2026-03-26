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

interface SignupFieldsProps {
  name: string;
  email: string;
  password: string;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}

function SignupFields({ name, email, password, onNameChange, onEmailChange, onPasswordChange }: SignupFieldsProps) {
  const t = useTranslations('auth.signup');

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="name">{t('name')}</Label>
        <Input
          id="name"
          name="name"
          placeholder={t('namePlaceholder')}
          required
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>
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
        <Label htmlFor="password">{t('password')}</Label>
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

function useSignupSubmit(name: string, email: string, password: string) {
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
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });

    if (authError) {
      setError(t('errors.generic'));
      setIsShaking(true);
      setLoading(false);
      return;
    }

    if (data.session === null) {
      setError(t('signup.checkEmail'));
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return { error, loading, isShaking, setIsShaking, handleSubmit };
}

function SignupForm() {
  const t = useTranslations('auth');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { error, loading, isShaking, setIsShaking, handleSubmit } = useSignupSubmit(name, email, password);
  const isFormValid = name.trim().length > 0 && EMAIL_REGEX.test(email) && password.length > 0;

  return (
    <>
      <OAuthButtons />
      <div className="flex items-center gap-2">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">{t('signup.or')}</span>
        <Separator className="flex-1" />
      </div>
      <form
        onSubmit={handleSubmit}
        className={`flex flex-col gap-3 ${isShaking ? 'auth-shake' : ''}`}
        onAnimationEnd={() => setIsShaking(false)}
      >
        <SignupFields
          name={name}
          email={email}
          password={password}
          onNameChange={setName}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
        />
        {error && <p className="text-destructive text-xs">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={!isFormValid || loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : t('signup.submit')}
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
