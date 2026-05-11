import { Library } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export default async function KnowledgeBaseEmptyPage(): Promise<React.JSX.Element> {
  const t = await getTranslations('knowledgeBase.emptyPage');
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex w-full max-w-3xl flex-col items-center gap-0 rounded-md bg-background px-4 py-8 text-center">
        <Library className="size-6 text-muted-foreground/50" />
        <p className="text-sm font-medium mt-1">{t('title')}</p>
        <p className="text-xs text-muted-foreground max-w-sm">{t('description')}</p>
      </div>
    </div>
  );
}
