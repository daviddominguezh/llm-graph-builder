export interface FilterDefinition {
  key: string;
  label: string;
  type: 'dateRange' | 'text' | 'select';
  options?: Array<{ value: string; label: string }>;
}

export interface ActiveFilter {
  key: string;
  label: string;
  value: string | string[] | { from: string; to: string };
  displayValue: string;
}

export interface FilterBarProps {
  definitions: FilterDefinition[];
  active: ActiveFilter[];
  onAdd: (filter: ActiveFilter) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
}
