'use client';

import { AuthCard } from '@/app/components/auth/AuthCard';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { OtpStep } from './OtpStep';
import { PhoneStep } from './PhoneStep';

export default function VerifyPhonePage() {
  const t = useTranslations('auth.verifyPhone');
  const [phone, setPhone] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');

  function handleAdvance(cu: string | null) {
    setCooldownUntil(cu);
    setStep('otp');
  }

  return (
    <AuthCard title={t('title')} description={t('description')}>
      {step === 'phone' ? (
        <PhoneStep phone={phone} onPhoneChange={setPhone} onAdvance={handleAdvance} />
      ) : (
        <OtpStep
          phone={phone}
          cooldownUntil={cooldownUntil}
          onEdit={() => setStep('phone')}
          onNewCooldown={setCooldownUntil}
        />
      )}
    </AuthCard>
  );
}
