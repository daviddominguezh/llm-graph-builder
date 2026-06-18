'use client';

import { type ProviderKind, useToolCatalog } from '@/app/lib/toolCatalog';
import type { RegistryTool } from '@/app/lib/toolRegistryTypes';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import { FloatingSchema, type ToolSchema } from './ToolSchemaPopover';
import { PlayButton } from './ToolsPanelViewMode';
import { DisabledIndicator, buildDisabledTooltip } from './toolStoreHelpers';

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
  onTest?: (tool: RegistryTool) => void;
  disabledReason?: ToolRowDisabledReason;
}

interface ToolRowHeaderProps {
  tool: RegistryTool;
  displayDescription: string | undefined;
  selected: boolean;
  disabled: boolean;
  disabledTooltip: string | undefined;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  onTest?: (tool: RegistryTool) => void;
}

function ToolRowHeader(props: ToolRowHeaderProps): React.JSX.Element {
  const {
    tool,
    displayDescription,
    selected,
    disabled,
    disabledTooltip,
    onToggleSelected,
    onToggleExpanded,
    onTest,
  } = props;
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
          {disabledTooltip !== undefined && <DisabledIndicator tooltip={disabledTooltip} />}
        </span>
        <span className="truncate text-[10px] text-muted-foreground">
          {displayDescription ?? tool.group}
        </span>
      </button>
      {onTest !== undefined && (
        <PlayButton
          tool={tool}
          onTest={onTest}
          disabled={disabled}
          disabledTooltip={disabledTooltip}
        />
      )}
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
  onTest,
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
          onTest={onTest}
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
