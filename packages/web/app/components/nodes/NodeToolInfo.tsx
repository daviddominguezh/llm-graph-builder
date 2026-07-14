import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { memo } from 'react';

import type { McpLibraryRow } from '../../lib/mcpLibraryTypes';
import { useMcpLibraryItems } from '../McpLibraryProvider';
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

// The MCP's display name comes from its registry group; the logo (if the MCP is one of
// our library MCPs) is matched by name against the fetched library rows.
function resolveMcpName(ref: ToolRef, registry: ToolRegistryValue | null): string | undefined {
  if (ref.providerType !== 'mcp' || registry === null) return undefined;
  const group = registry.groups.find((g) => g.kind === 'mcp' && g.providerId === ref.providerId);
  return group?.groupName;
}

function resolveMcpImage(mcpName: string | undefined, items: McpLibraryRow[]): string | null {
  if (mcpName === undefined) return null;
  return items.find((item) => item.name === mcpName)?.image_url ?? null;
}

function NodeMcpBadge({ label, name, imageUrl }: { label: string; name: string; imageUrl: string | null }) {
  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className="shrink-0">{label}</span>
      {imageUrl !== null && (
        <Image
          src={imageUrl}
          alt=""
          width={12}
          height={12}
          unoptimized
          className="size-3 rounded-sm object-contain shrink-0"
        />
      )}
      <span className="line-clamp-1! min-w-0 text-foreground/70">{name} MCP</span>
    </div>
  );
}

const NodeToolInfoComponent = ({ toolRef, fallbackDescription }: NodeToolInfoProps) => {
  const t = useTranslations('nodePanel');
  const registry = useToolRegistryOptional();
  const libraryItems = useMcpLibraryItems();
  const mcpName = resolveMcpName(toolRef, registry);
  const mcpImage = resolveMcpImage(mcpName, libraryItems);
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
          <Skeleton className="h-2 w-full bg-input/30" />
          <Skeleton className="h-2 w-3/5 bg-input/30" />
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        <p className="line-clamp-1! text-xs text-foreground">
          <span className="text-muted-foreground text-[10px]">{t('toolPrefix')} </span>
          <span className="font-mono">{toolRef.toolName}</span>
        </p>
        {mcpName !== undefined && (
          <NodeMcpBadge label={t('toolProvidedBy')} name={mcpName} imageUrl={mcpImage} />
        )}
      </div>
    </div>
  );
};

export const NodeToolInfo = memo(NodeToolInfoComponent);
