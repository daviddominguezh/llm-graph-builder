'use client';

import { Button } from '@/components/ui/button';
import { ContentBeam } from '@/components/ui/content-beam';
import { GlassPanel } from '@/components/ui/glass-panel';
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
    <div className="relative flex w-full shrink-0 h-6 border-t border-[0.5px]">
      <div className="flex w-full justify-end">
        <div className="relative rounded-full mr-4">
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
        </div>
      </div>
    </div>
  );
}
