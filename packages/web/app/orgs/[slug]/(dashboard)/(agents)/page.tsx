import { useTranslations } from 'next-intl';

export default function AgentsPage(): React.JSX.Element {
  const t = useTranslations('agents');

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted-foreground">{t('selectAgent')}</p>
    </div>
  );
}
