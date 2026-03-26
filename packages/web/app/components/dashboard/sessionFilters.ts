import type { FilterDefinition } from './filterBarTypes';

export function buildSessionFilterDefs(t: (key: string) => string): FilterDefinition[] {
  return [
    {
      key: 'status',
      label: t('filters.status'),
      type: 'select',
      options: [
        { value: 'success', label: t('filters.statusSuccess') },
        { value: 'error', label: t('filters.statusError') },
      ],
    },
    { key: 'tenant_id', label: t('filters.tenant'), type: 'text' },
    { key: 'user_id', label: t('filters.user'), type: 'text' },
    { key: 'session_id', label: t('filters.session'), type: 'text' },
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
    { key: 'dateRange', label: t('filters.dateRange'), type: 'dateRange' },
  ];
}
