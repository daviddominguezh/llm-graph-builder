'use client';

import type { GroupHeaderState } from '@/app/lib/agentTools';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslations } from 'next-intl';

interface ProviderHeaderProps {
  groupName: string;
  description?: string;
  state: GroupHeaderState;
  selectedInGroup: number;
  totalInGroup: number;
  visibleInGroup: number;
  searchActive: boolean;
  onToggle: () => void;
}

function formatCount(args: {
  state: GroupHeaderState;
  selected: number;
  total: number;
  visible: number;
  searchActive: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}): string {
  if (args.state === 'unchecked') return '';
  if (args.state === 'checked' && !args.searchActive) return `(${args.t('allSelected')})`;
  if (args.searchActive) {
    return `(${args.t('countOfTotalVisible', { n: args.selected, visible: args.visible, total: args.total })})`;
  }
  return `(${args.t('countOfTotal', { n: args.selected, total: args.total })})`;
}

export function ProviderHeader(props: ProviderHeaderProps): React.JSX.Element {
  const t = useTranslations('agentTools');
  const isChecked = props.state === 'checked';
  const isIndeterminate = props.state === 'indeterminate';
  const count = formatCount({
    state: props.state,
    selected: props.selectedInGroup,
    total: props.totalInGroup,
    visible: props.visibleInGroup,
    searchActive: props.searchActive,
    t,
  });
  return (
    <div className="sticky top-0 z-10 bg-background flex items-center gap-2 px-2 pt-2 pb-1.5">
      <Checkbox
        checked={isChecked}
        indeterminate={isIndeterminate}
        onCheckedChange={props.onToggle}
        aria-label={t('selectAll')}
      />
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <span>{props.groupName}</span>
          {count !== '' && <span className="lowercase">{count}</span>}
        </div>
        {props.description !== undefined && (
          <span className="text-[10px] text-muted-foreground truncate" title={props.description}>
            {props.description}
          </span>
        )}
      </div>
    </div>
  );
}
