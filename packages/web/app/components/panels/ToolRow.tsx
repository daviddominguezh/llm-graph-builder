'use client';

import { type ProviderKind, useToolCatalog } from '@/app/lib/toolCatalog';
import type { RegistryTool } from '@/app/lib/toolRegistryTypes';
import { Checkbox } from '@/components/ui/checkbox';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import { FloatingSchema, type ToolSchema } from './ToolSchemaPopover';

export type ToolRowDisabledReason = { kind: 'no_store_bound'; storeKind: 'kv' | 'rag' } | null;

interface ToolRowProps {
  tool: RegistryTool;
  providerId: string;
  providerKind: ProviderKind;
  selected: boolean;
  expanded: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  onCollapse: () => void;
  disabledReason?: ToolRowDisabledReason;
}

type TooltipTranslator = (key: 'storeRequiredTooltip', values: { kind: string }) => string;

function buildDisabledTooltip(
  reason: ToolRowDisabledReason,
  t: TooltipTranslator
): string | undefined {
  if (reason === null || reason === undefined) return undefined;
  const label = reason.storeKind === 'kv' ? 'KV' : 'RAG';
  return t('storeRequiredTooltip', { kind: label });
}

interface ToolRowHeaderProps {
  tool: RegistryTool;
  displayDescription: string | undefined;
  selected: boolean;
  disabled: boolean;
  disabledTooltip: string | undefined;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
}

function ToolRowHeader(props: ToolRowHeaderProps): React.JSX.Element {
  const { tool, displayDescription, selected, disabled, disabledTooltip, onToggleSelected, onToggleExpanded } = props;
  return (
    <>
      <Checkbox
        checked={selected}
        disabled={disabled}
        onCheckedChange={onToggleSelected}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5"
        aria-label={tool.name}
      />
      <button
        type="button"
        onClick={onToggleExpanded}
        className="flex min-w-0 flex-1 flex-col text-left cursor-pointer"
      >
        <span className="font-medium flex items-center gap-1">
          {tool.name}
          {disabledTooltip !== undefined && (
            <span
              title={disabledTooltip}
              aria-label={disabledTooltip}
              className="inline-flex items-center"
            >
              <Info className="size-3.5 text-orange-500 shrink-0" aria-hidden="true" />
            </span>
          )}
        </span>
        <span className="truncate text-[10px] text-muted-foreground">
          {displayDescription ?? tool.group}
        </span>
      </button>
    </>
  );
}

export function ToolRow({
  tool,
  providerId,
  providerKind,
  selected,
  expanded,
  onToggleSelected,
  onToggleExpanded,
  onCollapse,
  disabledReason,
}: ToolRowProps): React.JSX.Element {
  const rowRef = useRef<HTMLDivElement>(null);
  const t = useTranslations('agentTools');
  const catalog = useToolCatalog();
  const displayDescription = catalog.toolDescription(providerId, tool.name, tool.description, providerKind);
  const disabledTooltip = buildDisabledTooltip(disabledReason ?? null, t);
  const isDisabled = disabledTooltip !== undefined;
  const disabledCls = isDisabled ? 'opacity-60' : '';
  return (
    <li className={`flex flex-col w-[calc(50%_-_(var(--spacing)*2))] shrink-0 bg-card rounded-sm py-1.5 ${disabledCls}`}>
      <div
        ref={rowRef}
        className="group/tool flex w-full items-start gap-1.5 px-1 py-0 text-left text-xs cursor-pointer border-l-2 border-ring hover:border-accent"
      >
        <ToolRowHeader
          tool={tool}
          displayDescription={displayDescription}
          selected={selected}
          disabled={isDisabled}
          disabledTooltip={disabledTooltip}
          onToggleSelected={onToggleSelected}
          onToggleExpanded={onToggleExpanded}
        />
      </div>
      {expanded && tool.inputSchema !== undefined && (
        <FloatingSchema
          description={displayDescription}
          providerId={providerId}
          providerKind={providerKind}
          toolName={tool.name}
          anchorRef={rowRef}
          schema={tool.inputSchema as ToolSchema}
          onClose={onCollapse}
        />
      )}
    </li>
  );
}
