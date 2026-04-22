import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

interface SecuritySectionProps {
  phone: string | null;
}

export async function SecuritySection({ phone }: SecuritySectionProps): Promise<React.JSX.Element> {
  const t = await getTranslations('account.security');

  return (
    <Card className="bg-transparent ring-0">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-xs">
          <dt className="text-muted-foreground">{t('phone')}</dt>
          <dd className="font-medium">
            {phone !== null && phone !== '' ? phone : (
              <span className="text-muted-foreground italic">{t('noPhone')}</span>
            )}
          </dd>
        </dl>
        <div className="mt-4">
          <Link
            href="/forgot-password"
            className="text-xs text-primary underline underline-offset-3 hover:opacity-80"
          >
            {t('changePassword')}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
