import { useTranslations } from 'next-intl';

export default function ChatsPage(): React.JSX.Element {
  const t = useTranslations('orgs');

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <h1 className="text-2xl font-bold">{t('chats')}</h1>
      </div>
    </div>
  );
}
