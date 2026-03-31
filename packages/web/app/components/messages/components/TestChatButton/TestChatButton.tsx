import React from 'react';
import { useTranslations } from 'next-intl';

import { FlaskConical } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { useIsMobile } from '@/app/utils/device';

interface TestChatButtonProps {
  onClick: () => void;
  visible: boolean;
}

/**
 * TestChatButton
 *
 * Floating button to open the test chat for chatbot testing.
 * Only visible when no chat is selected.
 */
export const TestChatButton: React.FC<TestChatButtonProps> = ({ onClick, visible }) => {
  const t = useTranslations('messages');
  const isMobile = useIsMobile();

  if (!visible) return null;

  return (
    <div
      className="absolute w-fit bottom-17 z-30"
      style={{
        right: isMobile ? '16px' : '0px',

        bottom: isMobile ? '68px' : '16px',
      }}
    >
      <Tooltip>
        <TooltipTrigger>
          <Button onClick={onClick} className="w-[40px] h-[40px] rounded-full">
            <FlaskConical />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('Test your chatbot')}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

TestChatButton.displayName = 'TestChatButton';
