import { getTranslations } from 'next-intl/server';

export default async function KnowledgeBaseEmptyPage(): Promise<React.JSX.Element> {
  const t = await getTranslations('knowledgeBase.emptyPage');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-xs text-muted-foreground">{t('description')}</p>
    </div>
  );
}
