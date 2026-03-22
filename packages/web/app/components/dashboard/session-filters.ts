import type { FilterDefinition } from './filter-bar-types';

export function buildSessionFilterDefs(t: (key: string) => string): FilterDefinition[] {
  return [
    { key: 'dateRange', label: t('filters.dateRange'), type: 'dateRange' },
    { key: 'tenant_id', label: t('filters.tenant'), type: 'text' },
    { key: 'user_id', label: t('filters.user'), type: 'text' },
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
    { key: 'version', label: t('filters.version'), type: 'text' },
  ];
}
