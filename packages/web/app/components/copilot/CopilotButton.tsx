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
