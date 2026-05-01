'use client';

import { Button } from '@/components/ui/button';
import { ContentBeam } from '@/components/ui/content-beam';
import { MousePointer2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useCopilotContext } from './CopilotProvider';

export function CopilotButton() {
  const { isOpen, setOpen } = useCopilotContext();

  const t = useTranslations('copilot');

  return (
    <div className="relative flex w-full shrink-0 h-5">
      <div className="flex w-full justify-between items-center">
        <div className="text-[11px] font-semibold text-foreground flex gap-1 items-center ml-17">
          <div>OpenFlow</div>
          <div className="text-[10px] font-normal mt-[1px] text-muted-foreground">
            {'('}v0.1.0{')'}
          </div>
        </div>
        <div className="relative rounded-full mr-6 flex items-center pt-[0px]">
          <Button
            variant="default"
            size="xs"
            className={`relative h-5 gap-1 px-3 text-[11px] rounded-md bg-transparent dark:bg-transparent hover:bg-transparent dark:hover:bg-transparent text-foreground`}
            onClick={() => setOpen(!isOpen)}
          >
            {isOpen ? (
              <>
                <MousePointer2 className="size-3" />
                {t('title')}
              </>
            ) : (
              <ContentBeam duration={4} colorFrom="#ffaa40" colorTo="#9c40ff">
                <MousePointer2 className="size-3" />
                {t('title')}
              </ContentBeam>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
