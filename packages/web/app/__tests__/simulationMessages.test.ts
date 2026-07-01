import { describe, expect, it } from '@jest/globals';

import messages from '../../messages/en.json';

const REQUIRED = [
  'resetState.title',
  'resetState.description',
  'resetState.confirm',
  'resetState.cancel',
  'tenantSwitchReset.title',
  'tenantSwitchReset.description',
  'tenantSwitchReset.confirm',
  'tenantSwitchReset.cancel',
  'toolbar.testingPresetsLabel',
  'toolbar.simulationStateLabel',
  'toolbar.openPanel',
  'statePanel.empty',
  'statePanel.resetButton',
  'mcpBadge.label',
  'mcpBadge.tooltip',
];

describe('simulation translation keys', () => {
  it('all §8 keys exist', () => {
    const sim = (messages as Record<string, Record<string, unknown>>).simulation;
    for (const path of REQUIRED) {
      const [group, key] = path.split('.');
      const groupObj = sim[group as string] as Record<string, unknown> | undefined;
      expect(groupObj).toBeDefined();
      expect(groupObj?.[key as string]).toBeDefined();
    }
  });
});
