import type { Provider, ProviderCtx, ToolDescriptor } from '../provider.js';
import { buildCalendarTools } from './buildTools.js';
import { CALENDAR_DESCRIPTORS } from './descriptors.js';

async function describeCalendarTools(_ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  return await Promise.resolve(CALENDAR_DESCRIPTORS);
}

export const calendarProvider: Provider = {
  type: 'builtin',
  id: 'calendar',
  displayName: 'OpenFlow/Calendar',
  description: 'Read availability and manage events on a connected Google Calendar.',
  describeTools: describeCalendarTools,
  buildTools: buildCalendarTools,
};
