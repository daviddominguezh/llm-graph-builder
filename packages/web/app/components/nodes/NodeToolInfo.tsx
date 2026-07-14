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

  return (
    <div className="shrink-0 flex flex-col gap-1 px-2 pb-2 pt-1">
      {hasDescription && (
        <Tooltip>
          <TooltipTrigger
            className={`w-full line-clamp-2! rounded-sm shrink-0 p-1 italic flex flex-start text-left mt-1 text-xs text-muted-foreground bg-card`}
          >
            “{description}”
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm">
            {description}
          </TooltipContent>
        </Tooltip>
      )}
      <p className="line-clamp-1! text-xs text-foreground">
        <span className="text-muted-foreground">{t('toolPrefix')} </span>
        {toolRef.toolName}
      </p>
    </div>
  );
};

export const NodeToolInfo = memo(NodeToolInfoComponent);
