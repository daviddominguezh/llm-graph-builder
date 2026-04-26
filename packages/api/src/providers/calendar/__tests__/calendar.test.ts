import { describe, expect, it, jest } from '@jest/globals';

import type { Logger } from '../../../utils/logger.js';
import type { ProviderCtx } from '../../provider.js';
import { calendarProvider } from '../index.js';

function makeLogger(): Logger {
  return {
    error: jest.fn(),
    warn: jest.fn(),
    help: jest.fn(),
    data: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    prompt: jest.fn(),
    http: jest.fn(),
    verbose: jest.fn(),
    input: jest.fn(),
    silly: jest.fn(),
  };
}

function makeCtx(): ProviderCtx {
  return {
    orgId: 'o',
    agentId: 'a',
    isChildAgent: false,
    logger: makeLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: () => undefined,
  };
}

const EXPECTED_TOOL_COUNT = 7;

describe('calendarProvider', () => {
  it('has correct metadata', () => {
    expect(calendarProvider.id).toBe('calendar');
    expect(calendarProvider.type).toBe('builtin');
    expect(calendarProvider.displayName).toBe('OpenFlow/Calendar');
  });

  it('describes 7 tools', async () => {
    const tools = await calendarProvider.describeTools(makeCtx());
    expect(tools.length).toBeGreaterThanOrEqual(EXPECTED_TOOL_COUNT);
  });

  it('includes expected tool names', async () => {
    const tools = await calendarProvider.describeTools(makeCtx());
    const names = tools.map((t) => t.toolName);
    expect(names).toContain('list_calendars');
    expect(names).toContain('check_availability');
    expect(names).toContain('list_events');
    expect(names).toContain('get_event');
    expect(names).toContain('book_appointment');
    expect(names).toContain('update_event');
    expect(names).toContain('cancel_appointment');
  });

  it('returns empty when no calendar service in ctx', async () => {
    const built = await calendarProvider.buildTools({
      toolNames: ['check_availability'],
      ctx: makeCtx(),
    });
    expect(built).toEqual({});
  });
});
