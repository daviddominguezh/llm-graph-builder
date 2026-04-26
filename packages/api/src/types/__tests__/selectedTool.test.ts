import { describe, expect, it } from '@jest/globals';

import { BUILTIN_PROVIDER_IDS, type SelectedTool, equalsSelectedTool } from '../selectedTool.js';

describe('SelectedTool helpers', () => {
  const a: SelectedTool = { providerType: 'builtin', providerId: 'calendar', toolName: 'check_availability' };
  const b: SelectedTool = { providerType: 'builtin', providerId: 'calendar', toolName: 'check_availability' };
  const c: SelectedTool = { providerType: 'builtin', providerId: 'forms', toolName: 'set_form_fields' };

  it('returns true for structurally equal SelectedTools', () => {
    expect(equalsSelectedTool(a, b)).toBe(true);
  });

  it('returns false for different toolName', () => {
    expect(equalsSelectedTool(a, c)).toBe(false);
  });

  it('returns false for different providerType', () => {
    const mcp: SelectedTool = { providerType: 'mcp', providerId: 'calendar', toolName: 'check_availability' };
    expect(equalsSelectedTool(a, mcp)).toBe(false);
  });

  it('exposes the four canonical builtin provider IDs', () => {
    expect(BUILTIN_PROVIDER_IDS).toEqual(['calendar', 'forms', 'lead_scoring', 'composition']);
  });
});
