'use client';

import { Button } from '@/components/ui/button';
import { WandSparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

import { useCopilotContext } from './CopilotProvider';

function isAgentsTab(pathname: string): boolean {
  const match = pathname.match(/^\/orgs\/[^/]+(?:\/(.*))?$/);
  const rest = match?.[1] ?? '';
  const segment = rest.split('/')[0] ?? '';
  return segment === '' || segment === 'editor';
}

export function CopilotButton() {
  const { isOpen, setOpen } = useCopilotContext();
  const pathname = usePathname();
  const t = useTranslations('copilot');

  if (!isAgentsTab(pathname)) return null;

  return (
    <div className="mr-2 flex shrink-0 justify-end">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1 rounded-sm px-2 text-xs text-muted-foreground relative -mt-[1px]"
        onClick={() => setOpen(!isOpen)}
      >
        <WandSparkles className="size-3" />
        {t('title')}
      </Button>
    </div>
  );
}
