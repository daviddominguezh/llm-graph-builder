import type { FilterDefinition } from './filterBarTypes';

export function buildTenantSummaryFilterDefs(t: (key: string) => string): FilterDefinition[] {
  return [
    { key: 'dateRange', label: t('filters.dateRange'), type: 'dateRange' },
    {
      key: 'channel',
      label: t('filters.channel'),
      type: 'select',
      options: [
        { value: 'web', label: 'Web' },
        { value: 'whatsapp', label: 'WhatsApp' },
      ],
    },
    { key: 'model', label: t('filters.model'), type: 'text' },
  ];
}
