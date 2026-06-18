'use client';

import type { RegistryTool } from '@/app/lib/toolRegistryTypes';
import { Checkbox } from '@/components/ui/checkbox';
import { Info } from 'lucide-react';
import { useRef } from 'react';

import { FloatingSchema, type ToolSchema } from './ToolSchemaPopover';

export type ToolRowDisabledReason = { kind: 'no_store_bound'; storeKind: 'kv' | 'rag' } | null;

interface ToolRowProps {
  tool: RegistryTool;
  selected: boolean;
  expanded: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  onCollapse: () => void;
  disabledReason?: ToolRowDisabledReason;
}

function buildDisabledTooltip(reason: ToolRowDisabledReason): string | undefined {
  if (reason === null || reason === undefined) return undefined;
  /* i18n: toolRowNoStoreBoundTooltip */
  const label = reason.storeKind === 'kv' ? 'KV' : 'RAG';
  return `Select a ${label} store at the top of this group to enable this tool.`;
}

interface ToolRowHeaderProps {
  tool: RegistryTool;
  selected: boolean;
  disabled: boolean;
  disabledTooltip: string | undefined;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
}

function ToolRowHeader(props: ToolRowHeaderProps): React.JSX.Element {
  const { tool, selected, disabled, disabledTooltip, onToggleSelected, onToggleExpanded } = props;
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
          {tool.description ?? tool.group}
        </span>
      </button>
    </>
  );
}

export function ToolRow({
  tool,
  selected,
  expanded,
  onToggleSelected,
  onToggleExpanded,
  onCollapse,
  disabledReason,
}: ToolRowProps): React.JSX.Element {
  const rowRef = useRef<HTMLDivElement>(null);
  const disabledTooltip = buildDisabledTooltip(disabledReason ?? null);
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
          selected={selected}
          disabled={isDisabled}
          disabledTooltip={disabledTooltip}
          onToggleSelected={onToggleSelected}
          onToggleExpanded={onToggleExpanded}
        />
      </div>
      {expanded && tool.inputSchema !== undefined && (
        <FloatingSchema
          description={tool.description}
          anchorRef={rowRef}
          schema={tool.inputSchema as ToolSchema}
          onClose={onCollapse}
        />
      )}
    </li>
  );
}
