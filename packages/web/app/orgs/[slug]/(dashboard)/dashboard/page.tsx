import { useTranslations } from 'next-intl';

export default function DashboardPage(): React.JSX.Element {
  const t = useTranslations('orgs');

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('dashboard')}</h1>
    </div>
  );
}
