import type { FilterDefinition } from './filter-bar-types';

export function buildAgentSummaryFilterDefs(t: (key: string) => string): FilterDefinition[] {
  return [
    { key: 'dateRange', label: t('filters.dateRange'), type: 'dateRange' },
    { key: 'version', label: t('filters.version'), type: 'text' },
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
