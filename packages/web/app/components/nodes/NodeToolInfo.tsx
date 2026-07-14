import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

interface NodeToolInfoProps {
  name: string;
  description?: string;
}

const NodeToolInfoComponent = ({ name, description }: NodeToolInfoProps) => {
  const t = useTranslations('nodePanel');
  const hasDescription = description !== undefined && description !== '';

  return (
    <div className="shrink-0 flex flex-col gap-1 p-3">
      <p className="line-clamp-1! text-xs text-foreground">
        <span className="text-muted-foreground">{t('toolPrefix')} </span>
        {name}
      </p>
      {hasDescription && (
        <Tooltip>
          <TooltipTrigger className="line-clamp-2! block text-left text-[9px] italic text-foreground leading-[10px]">
            “{description}”
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm">
            {description}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

export const NodeToolInfo = memo(NodeToolInfoComponent);
