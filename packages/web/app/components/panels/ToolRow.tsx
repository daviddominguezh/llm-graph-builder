'use client';

import type { RegistryTool } from '@/app/lib/toolRegistryTypes';
import { Checkbox } from '@/components/ui/checkbox';
import { useRef } from 'react';

import { FloatingSchema, type ToolSchema } from './ToolSchemaPopover';

interface ToolRowProps {
  tool: RegistryTool;
  selected: boolean;
  expanded: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  onCollapse: () => void;
}

export function ToolRow({
  tool,
  selected,
  expanded,
  onToggleSelected,
  onToggleExpanded,
  onCollapse,
}: ToolRowProps): React.JSX.Element {
  const rowRef = useRef<HTMLDivElement>(null);
  return (
    <li className="flex flex-col w-[calc(50%_-_(var(--spacing)*2))] shrink-0 bg-card rounded-sm py-1.5">
      <div
        ref={rowRef}
        className="group/tool flex w-full items-start gap-1.5 px-1 py-0 text-left text-xs cursor-pointer border-l-2 border-ring hover:border-accent"
      >
        <Checkbox
          checked={selected}
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
          <span className="font-medium">{tool.name}</span>
          <span className="truncate text-[10px] text-muted-foreground">
            {tool.description ?? tool.group}
          </span>
        </button>
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
