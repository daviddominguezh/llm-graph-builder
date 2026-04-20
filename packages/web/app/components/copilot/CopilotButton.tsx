'use client';

import { Button } from '@/components/ui/button';
import { ContentBeam } from '@/components/ui/content-beam';
import { WandSparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useCopilotContext } from './CopilotProvider';

export function CopilotButton() {
  const { isOpen, setOpen } = useCopilotContext();

  const t = useTranslations('copilot');

  return (
    <div className="relative flex w-full shrink-0 h-6 bg-secondary">
      <div className="flex w-full justify-between items-center">
        <div className="text-xs font-semibold ml-4 text-secondary-foreground flex gap-1 items-center">
          <div>OpenFlow</div>
          <div className="text-[10px] font-normal mt-[1px]">
            {'('}v0.1.0{')'}
          </div>
        </div>
        <div className="relative rounded-full mr-4 flex items-center">
          <Button
            variant="default"
            size="xs"
            className={`relative h-5 gap-1 px-3 text-[11px] rounded-md bg-secondary-foreground dark:bg-secondary-foreground hover:bg-secondary-foreground/90 dark:hover:bg-secondary-foreground/90
            ${
              isOpen
                ? 'bg-accent text-accent-foreground hover:bg-accent/85 hover:text-accent-foreground '
                : 'text-black'
            }`}
            onClick={() => setOpen(!isOpen)}
          >
            {isOpen ? (
              <>
                <WandSparkles className="size-2.5" />
                {t('title')}
              </>
            ) : (
              <ContentBeam duration={4} colorFrom="#ffaa40" colorTo="#9c40ff">
                <WandSparkles className="size-2.5" />
                {t('title')}
              </ContentBeam>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
