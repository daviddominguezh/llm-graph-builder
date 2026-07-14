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
          className={`w-full line-clamp-2! rounded-sm shrink-0 p-1 italic flex flex-start text-left mt-1 text-xs text-muted-foreground bg-card ${classStyle}`}
        >
          “{text}”
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm">
          {text}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="px-2 pb-0 pt-1">
      {description && renderTooltip(description, 'line-clamp-3!')}
      {text && renderTooltip(text, 'line-clamp-4!')}
    </div>
  );
};

export const NodeBody = memo(
  NodeBodyComponent,
  (prev, next) =>
    prev.nodeId === next.nodeId && prev.description === next.description && prev.text === next.text
);
