import { describe, expect, it } from '@jest/globals';

import {
  MAX_SELECTED_TOOLS,
  PatchSelectedToolsBodySchema,
  SelectedToolSchema,
} from '../selectedToolSchema.js';

describe('SelectedToolSchema', () => {
  it('accepts a valid SelectedTool', () => {
    expect(() =>
      SelectedToolSchema.parse({
        providerType: 'builtin',
        providerId: 'calendar',
        toolName: 'check_availability',
      })
    ).not.toThrow();
  });

  it('rejects empty providerId', () => {
    expect(() =>
      SelectedToolSchema.parse({ providerType: 'builtin', providerId: '', toolName: 'check_availability' })
    ).toThrow();
  });

  it('rejects unknown providerType', () => {
    expect(() =>
      SelectedToolSchema.parse({ providerType: 'plugin', providerId: 'x', toolName: 'y' })
    ).toThrow();
  });
});

describe('PatchSelectedToolsBodySchema', () => {
  it('accepts a body with a small array + ISO updatedAt', () => {
    const body = {
      tools: [{ providerType: 'builtin', providerId: 'calendar', toolName: 'list_calendars' }],
      expectedUpdatedAt: '2026-04-26T10:00:00.000Z',
    };
    expect(() => PatchSelectedToolsBodySchema.parse(body)).not.toThrow();
  });

  const EXPECTED_CAP = 100;
  const ONE = 1;
  const OVER_CAP = MAX_SELECTED_TOOLS + ONE;

  it('exposes the cap as 100', () => {
    expect(MAX_SELECTED_TOOLS).toBe(EXPECTED_CAP);
  });

  it('rejects more than MAX_SELECTED_TOOLS entries', () => {
    const tools = Array.from({ length: OVER_CAP }, (_, i) => ({
      providerType: 'builtin' as const,
      providerId: 'calendar',
      toolName: `tool_${String(i)}`,
    }));
    expect(() =>
      PatchSelectedToolsBodySchema.parse({ tools, expectedUpdatedAt: '2026-04-26T10:00:00.000Z' })
    ).toThrow();
  });

  it('rejects a non-ISO expectedUpdatedAt', () => {
    expect(() =>
      PatchSelectedToolsBodySchema.parse({ tools: [], expectedUpdatedAt: 'not-a-date' })
    ).toThrow();
  });
});
