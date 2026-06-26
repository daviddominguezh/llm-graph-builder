import type { SelectedTool } from '@daviddh/llm-graph-runner';
import { describe, expect, it } from '@jest/globals';

import {
  type GroupHeaderState,
  computeHeaderState,
  findStaleSelections,
  isToolSelected,
  toggleTool,
} from '../agentTools';

const calA: SelectedTool = {
  providerType: 'builtin',
  providerId: 'calendar',
  toolName: 'check_availability',
};
const calB: SelectedTool = { providerType: 'builtin', providerId: 'calendar', toolName: 'list_calendars' };

describe('agentTools', () => {
  it('toggleTool adds when missing', () => {
    expect(toggleTool([], calA)).toEqual([calA]);
  });

  it('toggleTool removes when present', () => {
    expect(toggleTool([calA, calB], calA)).toEqual([calB]);
  });

  it('isToolSelected works', () => {
    expect(isToolSelected([calA], calA)).toBe(true);
    expect(isToolSelected([calA], calB)).toBe(false);
  });

  it('computeHeaderState classifies all/none/partial', () => {
    const groupTools: SelectedTool[] = [calA, calB];
    const unchecked: GroupHeaderState = 'unchecked';
    const indeterminate: GroupHeaderState = 'indeterminate';
    const checked: GroupHeaderState = 'checked';
    expect(computeHeaderState({ groupTools, selected: [] })).toEqual(unchecked);
    expect(computeHeaderState({ groupTools, selected: [calA] })).toEqual(indeterminate);
    expect(computeHeaderState({ groupTools, selected: [calA, calB] })).toEqual(checked);
  });

  it('findStaleSelections returns refs absent from registry', () => {
    const registry: SelectedTool[] = [calA];
    const sel: SelectedTool[] = [calA, calB];
    expect(findStaleSelections({ selections: sel, registry, failedProviders: [] })).toEqual([calB]);
  });

  it('findStaleSelections excludes refs from failed providers', () => {
    const registry: SelectedTool[] = [];
    const sel: SelectedTool[] = [calA];
    expect(findStaleSelections({ selections: sel, registry, failedProviders: ['calendar'] })).toEqual([]);
  });
});
