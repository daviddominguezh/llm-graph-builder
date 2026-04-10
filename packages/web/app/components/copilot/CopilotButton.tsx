'use client';

import { Button } from '@/components/ui/button';
import { BorderBeam } from '@/components/ui/border-beam';
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
      <div className="relative rounded-md">
        <Button
          variant="ghost"
          size="sm"
          className={
            isOpen
              ? 'relative h-6 gap-1 rounded-sm px-2 text-xs bg-accent text-accent-foreground -mt-[1px]'
              : 'relative h-6 gap-1 rounded-sm px-2 text-xs text-muted-foreground -mt-[1px]'
          }
          onClick={() => setOpen(!isOpen)}
        >
          <WandSparkles className="size-3" />
          {t('title')}
        </Button>
        {!isOpen && (
          <BorderBeam size={30} duration={4} borderWidth={1.5} colorFrom="#ffaa40" colorTo="#9c40ff" />
        )}
      </div>
    </div>
  );
}
