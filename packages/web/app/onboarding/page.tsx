import { AuthCard } from '@/app/components/auth/AuthCard';
import { getTranslations } from 'next-intl/server';

import { OnboardingForm } from './OnboardingForm';

export default async function OnboardingPage() {
  const t = await getTranslations('onboarding');

  return (
    <AuthCard title={t('title')} description={t('description')} className="max-w-3xl">
      <OnboardingForm />
    </AuthCard>
  );
}
