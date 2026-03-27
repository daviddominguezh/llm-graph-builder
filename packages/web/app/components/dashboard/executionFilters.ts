import type { FilterDefinition } from './filterBarTypes';

export function buildExecutionFilterDefs(t: (key: string) => string): FilterDefinition[] {
  return [
    {
      key: 'status',
      label: t('filters.status'),
      type: 'select',
      options: [
        { value: 'completed', label: t('filters.statusCompleted') },
        { value: 'failed', label: t('filters.statusError') },
        { value: 'running', label: t('filters.statusRunning') },
      ],
    },
    { key: 'agent_name', label: t('filters.agent'), type: 'text' },
    { key: 'session_id', label: t('filters.session'), type: 'text' },
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
    { key: 'dateRange', label: t('filters.dateRange'), type: 'dateRange' },
  ];
}
