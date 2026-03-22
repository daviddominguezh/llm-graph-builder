'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';

import { ThemeSwitcher } from '../ThemeSwitcher';

export function AppearanceSection() {
  const t = useTranslations('theme');

  return (
    <Card className='bg-background'>
      <CardHeader>
        <CardTitle>{t('appearance')}</CardTitle>
        <CardDescription>{t('appearanceDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ThemeSwitcher />
      </CardContent>
    </Card>
  );
}
