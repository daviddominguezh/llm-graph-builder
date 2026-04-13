'use client';

import { BorderBeam } from '@/components/ui/border-beam';
import { Button } from '@/components/ui/button';
import { ContentBeam } from '@/components/ui/content-beam';
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
    <div className="mr-4 flex shrink-0 justify-end">
      <div className="relative rounded-full">
        <Button
          variant="ghost"
          size="sm"
          className={`relative h-6 gap-1 px-3 text-xs -mt-[1px]
            ${
              isOpen
                ? 'bg-accent text-accent-foreground hover:bg-accent/85 hover:text-accent-foreground '
                : 'text-muted-foreground'
            }`}
          onClick={() => setOpen(!isOpen)}
        >
          {isOpen ? (
            <>
              <WandSparkles className="size-3" />
              {t('title')}
            </>
          ) : (
            <ContentBeam duration={4} colorFrom="#ffaa40" colorTo="#9c40ff">
              <WandSparkles className="size-3" />
              {t('title')}
            </ContentBeam>
          )}
        </Button>
        {!isOpen && (
          <BorderBeam size={30} duration={4} borderWidth={1.5} colorFrom="#ffaa40" colorTo="#9c40ff" />
        )}
      </div>
    </div>
  );
}
