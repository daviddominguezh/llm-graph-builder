import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

import { type ToolRegistryValue, useToolRegistryOptional } from '../ToolRegistryProvider';

export interface ToolRef {
  providerType: 'builtin' | 'mcp';
  providerId: string;
  toolName: string;
}

interface NodeToolInfoProps {
  toolRef: ToolRef;
  fallbackDescription?: string;
}

// Resolve the tool's own description (provided by the MCP / builtin registry) from
// the tool registry, matching on provider + tool name.
function resolveToolDescription(ref: ToolRef, registry: ToolRegistryValue | null): string | undefined {
  if (registry === null) return undefined;
  const inGroup = registry.groups
    .find((g) => g.providerId === ref.providerId)
    ?.tools.find((tool) => tool.name === ref.toolName);
  const found = inGroup ?? registry.tools.find((tool) => tool.name === ref.toolName);
  return found?.description;
}

const NodeToolInfoComponent = ({ toolRef, fallbackDescription }: NodeToolInfoProps) => {
  const t = useTranslations('nodePanel');
  const registry = useToolRegistryOptional();
  const description = resolveToolDescription(toolRef, registry) ?? fallbackDescription;
  const hasDescription = description !== undefined && description !== '';
  // A tool always has a description; while the registry is still loading, show a
  // placeholder instead of an empty gap that fills in a moment later.
  const isLoadingDescription = !hasDescription && registry?.state.kind === 'loading';

  return (
    <div className="shrink-0 flex flex-col gap-1 px-2 pb-2 pt-1">
      {hasDescription && (
        <Tooltip>
          <TooltipTrigger
            className={`w-full line-clamp-3! rounded-sm shrink-0 p-[calc(-1px+var(--spacing))] italic flex flex-start text-left mt-1 text-[10px] text-muted-foreground bg-input/30 overflow-hidden`}
          >
            “{description}”
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm">
            {description}
          </TooltipContent>
        </Tooltip>
      )}
      {isLoadingDescription && (
        <div className="w-full shrink-0 rounded-sm bg-card p-1 mt-1 flex flex-col gap-1">
          <Skeleton className="h-2 w-full bg-input/30" />
          <Skeleton className="h-2 w-3/5 bg-input/30" />
        </div>
      )}
      <p className="line-clamp-1! text-xs text-foreground">
        <span className="text-muted-foreground">{t('toolPrefix')} </span>
        {toolRef.toolName}
      </p>
    </div>
  );
};

export const NodeToolInfo = memo(NodeToolInfoComponent);
