import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { memo } from 'react';

interface NodeBodyProps {
  nodeId: string;
  description: string;
  text: string;
}

const NodeBodyComponent = ({ description, text }: NodeBodyProps) => {
  const renderTooltip = (text: string, classStyle: string) => {
    return (
      <Tooltip>
        <TooltipTrigger
          className={`w-full line-clamp-3! rounded-sm shrink-0 p-[calc(-1px+var(--spacing))] italic flex flex-start text-left mt-1 text-[10px] text-muted-foreground bg-input/30 overflow-hidden ${classStyle}`}
        >
          “{text}”
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm">
          {text}
        </TooltipContent>
      </Tooltip>
    );
  };

  if (description || text)
    return (
      <div className="px-2 pb-2 pt-1">
        {description && renderTooltip(description, 'line-clamp-3!')}
        {text && renderTooltip(text, 'line-clamp-4!')}
      </div>
    );

  return <></>;
};

export const NodeBody = memo(
  NodeBodyComponent,
  (prev, next) =>
    prev.nodeId === next.nodeId && prev.description === next.description && prev.text === next.text
);
