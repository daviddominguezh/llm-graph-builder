import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTranslations } from 'next-intl/server';

interface ProfileSectionProps {
  email: string;
  fullName: string | null;
}

export async function ProfileSection({ email, fullName }: ProfileSectionProps): Promise<React.JSX.Element> {
  const t = await getTranslations('account.profile');

  return (
    <Card className="bg-transparent ring-0">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-xs">
          <dt className="text-muted-foreground">{t('emailLabel')}</dt>
          <dd className="font-medium">{email}</dd>
          <dt className="text-muted-foreground">{t('nameLabel')}</dt>
          <dd className="font-medium">
            {fullName !== null && fullName !== '' ? fullName : (
              <span className="text-muted-foreground italic">{t('nameEditingSoon')}</span>
            )}
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}
