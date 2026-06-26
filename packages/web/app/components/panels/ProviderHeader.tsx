'use client';

import type { GroupHeaderState } from '@/app/lib/agentTools';
import { type ProviderKind, useToolCatalog } from '@/app/lib/toolCatalog';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslations } from 'next-intl';

import { CatalogFreshnessIndicator } from './CatalogFreshnessIndicator';

interface ProviderHeaderProps {
  providerId: string;
  providerKind: ProviderKind;
  groupName: string;
  description?: string;
  state: GroupHeaderState;
  selectedInGroup: number;
  totalInGroup: number;
  visibleInGroup: number;
  searchActive: boolean;
  fetchedAt?: number;
  onToggle: () => void;
  disabled?: boolean;
  leadingIndicator?: React.ReactNode;
  rightSlot?: React.ReactNode;
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
  const catalog = useToolCatalog();
  const displayGroupName = catalog.groupName(props.providerId, props.groupName, props.providerKind);
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
    <div className="sticky top-0 z-10 flex items-center gap-2 px-2 pt-1.5 pb-1.5 bg-[rgb(255_255_255)] dark:bg-[rgb(20_20_20)]">
      <Checkbox
        checked={isChecked}
        indeterminate={isIndeterminate}
        onCheckedChange={props.onToggle}
        disabled={props.disabled}
        aria-label={t('selectAll')}
      />
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {props.leadingIndicator}
          <span className="cursor-default">{displayGroupName}</span>
          {count !== '' && <span className="lowercase">{count}</span>}
          {props.fetchedAt !== undefined && <CatalogFreshnessIndicator fetchedAt={props.fetchedAt} />}
        </div>
        {props.description !== undefined && (
          <span className="text-[10px] text-muted-foreground truncate" title={props.description}>
            {props.description}
          </span>
        )}
      </div>
      {props.rightSlot !== undefined && <div className="flex items-center shrink-0">{props.rightSlot}</div>}
    </div>
  );
}
